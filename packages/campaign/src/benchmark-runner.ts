/**
 * RB-015 offline benchmark runner (contract v2).
 *
 * Takes a `ComparisonPlan` and produces a `ComparisonReportV2` with exactly one `RunRecordV2`
 * per planned run. Contract: packages/contracts/src/benchmark-v2.ts and
 * docs/contracts/rb-015-baseline.md §9. The plan row and every run row are written to the
 * evidence store's benchmark tables (§9.5); the report is exported by reading them back.
 *
 * Offline only. Runs the two offline arms (`scripted_known`, `seeded_random`) against the
 * in-process synthetic trade fixtures through the existing scripted campaign path
 * (ScriptedCampaignRunner.submit → verifier → evidence store) and confirms candidates through
 * the existing RB-013 replay path (replayBundle → applyConfirmingReplay). LLM arms are always
 * recorded as `not_run`. There are no LLM, network, Thor or SSH calls here.
 *
 * RB-016: a plan whose settings name `rulebreak-reward-v1` runs against the synthetic reward pair
 * instead (see buildRewardOfflinePlan). Only `scripted_known` runs there; `seeded_random` and the
 * LLM arms are `not_run` because no explorer has a `reward_claim` tool (RB-018, parked).
 *
 * Randomness: every explorer choice comes from one mulberry32 generator keyed from
 * (generatorId, explorerSeed). Wall-clock time is read only to report `wallSeconds` and to
 * enforce `maxWallSeconds`; it never influences a choice.
 */
import {
  APPROVED_RULE_PACK_REWARD_V1,
  APPROVED_RULE_PACK_V1,
  ComparisonPlanSchema,
  RewardClaimParamsSchema,
  assertNoAuthorityFields,
  DEFAULT_INITIAL_WORLD,
  OFFLINE_ARMS,
  RunRecordV2Schema,
  comparableSettingsKey,
  parseExplorerToolArgs,
  resolveOutcomeV2,
  truncateErrorMessage,
  type ArmConfig,
  type BenchmarkArm,
  type BenchmarkTarget,
  type BenchmarkToolName,
  type ComparableSettings,
  type ComparisonPlan,
  type ComparisonReportV2,
  type InitialWorld,
  type InvariantViolation,
  type PlannedRun,
  type PlayerId,
  type ProvenanceMode,
  type RunRecordV2,
  type StopReason,
} from "@rulebreak/contracts";
import {
  SYNTHETIC_TARGET_IDS,
  bindActor,
  createSyntheticTargetAdapter,
  knownRewardDoubleClaimSteps,
  type CoordinatorTargetAdapter,
  type SyntheticTargetFamily,
} from "@rulebreak/economy";
import { EvidenceStore, applyConfirmingReplay } from "@rulebreak/evidence";
import { loadBundleFromStore, replayBundle, rulePackForTargetFamily } from "@rulebreak/replay";
import { canonicalJson, hashWorldState } from "@rulebreak/verifier";
import {
  ScriptedCampaignRunner,
  knownTradeFailureSteps,
  makeEnvelope,
  type ScriptedStep,
} from "./scripted-runner.js";

export const RB015_RESET_PROCEDURE_ID = "rb015-fresh-adapter-initialize-v1";
export const RB015_SEEDED_RANDOM_GENERATOR_ID = "mulberry32-fnv1a32-v1";
export const RB015_KNOWN_SCRIPT_ID = "p0-known-cancel-after-accept-v1";
export const RB015_BUILD_ID = "rulebreak-economy-0.1.0";
export const LIVE_GATE_NOT_RUN_REASON =
  "live gate not approved: the RB-015 offline runner makes no LLM, network or Thor calls";

/** RB-016 reward pair. */
export const RB016_REWARD_RESET_PROCEDURE_ID = "rb016-fresh-reward-adapter-initialize-v1";
export const RB016_KNOWN_REWARD_SCRIPT_ID = "rb016-known-reward-double-claim-v1";
export const RB016_REWARD_TARGET_IDS = SYNTHETIC_TARGET_IDS.reward;
export const REWARD_NO_TOOL_NOT_RUN_REASON =
  "no reward_claim tool: reward_claim is a scripted-only benchmark action, not an explorer or MCP tool (RB-018, parked)";
export const REWARD_NO_TOOL_LLM_NOT_RUN_REASON =
  "no reward_claim tool (RB-018, parked); the live gate is also not approved and the offline runner makes no LLM, network or Thor calls";

const PLAYERS: readonly PlayerId[] = ["player-a", "player-b"];
const MUTATING_TOOLS = new Set<BenchmarkToolName>(["trade_create", "trade_accept", "trade_cancel", "reward_claim"]);

const RESET_PROCEDURE_IDS: Readonly<Record<SyntheticTargetFamily, string>> = {
  trade: RB015_RESET_PROCEDURE_ID,
  reward: RB016_REWARD_RESET_PROCEDURE_ID,
};

/** Target family a plan runs against, from its settings' rule pack. Null for an unknown pack. */
export function targetFamilyForSettings(settings: Pick<ComparableSettings, "rulePackId">): SyntheticTargetFamily | null {
  if (settings.rulePackId === APPROVED_RULE_PACK_V1.rulePackId) return "trade";
  if (settings.rulePackId === APPROVED_RULE_PACK_REWARD_V1.rulePackId) return "reward";
  return null;
}

// ---------------------------------------------------------------------------
// Seeded PRNG (recorded by generatorId). No platform RNG anywhere in this path.
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit string hash, used only to key the PRNG. */
export function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small deterministic 32-bit PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SeededChooser {
  readonly #next: () => number;
  constructor(generatorId: string, explorerSeed: string) {
    this.#next = mulberry32(fnv1a32(`${generatorId}|${explorerSeed}`));
  }
  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.#next() * n);
  }
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("SeededChooser.pick on empty list");
    return items[this.int(items.length)]!;
  }
}

// ---------------------------------------------------------------------------
// World / reset
// ---------------------------------------------------------------------------

export function initialWorldForSeed(worldSeed: string): InitialWorld {
  return { ...DEFAULT_INITIAL_WORLD, players: [...DEFAULT_INITIAL_WORLD.players], seed: worldSeed };
}

function createTarget(family: SyntheticTargetFamily, mode: BenchmarkTarget["fixtureMode"]): CoordinatorTargetAdapter {
  return createSyntheticTargetAdapter(family, mode);
}

/** Hash of the world produced by the reset procedure for `worldSeed` (same for both fixtures of a family). */
export function initialStateHashFor(worldSeed: string, family: SyntheticTargetFamily = "trade"): string {
  const target = createSyntheticTargetAdapter(family, "fixed");
  const hash = hashWorldState(target.initialize(initialWorldForSeed(worldSeed)));
  target.dispose();
  return hash;
}

// ---------------------------------------------------------------------------
// Explorer tool calls
// ---------------------------------------------------------------------------

export type ExplorerCall = {
  actorId: PlayerId;
  tool: BenchmarkToolName;
  args: Record<string, unknown>;
};

type Explorer = {
  /** Next call, or null for a natural stop. */
  next(index: number, target: CoordinatorTargetAdapter): ExplorerCall | null;
};

function scriptedKnownExplorer(steps: ScriptedStep[]): Explorer {
  return {
    next(index) {
      const step = steps[index];
      return step ? { actorId: step.actorId, tool: step.kind, args: { ...step.params } } : null;
    },
  };
}

/**
 * Seeded random explorer. Chooses a tool uniformly from `toolAccess` (deduped and sorted so the
 * order-insensitive settings key implies identical behaviour), an actor uniformly, and args from
 * small domains. Trade ids come from the actor's own bound public view plus one decoy id.
 */
function seededRandomExplorer(
  chooser: SeededChooser,
  toolAccess: readonly BenchmarkToolName[],
  world: InitialWorld,
): Explorer {
  const tools = [...new Set(toolAccess)].sort();
  return {
    next(index, target) {
      const actorId = chooser.pick(PLAYERS);
      const tool = chooser.pick(tools);
      switch (tool) {
        case "economy_observe":
          return { actorId, tool, args: { view: chooser.pick(["self", "public"] as const) } };
        case "strategy_note":
          return { actorId, tool, args: { text: `seeded_random note ${index}` } };
        case "trade_create":
          return {
            actorId,
            tool,
            args: {
              itemId: chooser.pick([world.uniqueItemId, "relic-decoy"]),
              counterpartyId: chooser.pick(PLAYERS),
              price: 1 + chooser.int(world.startingCurrency + 50),
            },
          };
        case "trade_accept":
        case "trade_cancel": {
          const view = bindActor(target, actorId).inspectForActor(actorId);
          const ids = [...view.publicTrades.map((t) => t.tradeId), "trade-9999"];
          return { actorId, tool, args: { tradeId: chooser.pick(ids) } };
        }
        case "reward_claim":
          // Unreachable: settingsProblem refuses reward_claim on the trade pair, and seeded_random
          // is not_run on the reward pair (no reward_claim explorer tool, RB-018).
          throw new Error("seeded_random has no reward_claim tool");
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export type OfflineRunTrace = {
  runId: string;
  /** Canonical `actor:tool:args` strings in order, one per counted action. */
  calls: string[];
  errorMessage?: string;
};

/** Test seams. Production callers leave these unset. */
export type RunComparisonHooks = {
  /** Called before each counted action; throwing here is a loop error. */
  beforeAction?: (runId: string, actionIndex: number) => void;
  /** Called before replay of a candidate; throwing here is a replay (post-loop) error. */
  beforeReplay?: (runId: string) => void;
  /** Called after a run row is written; throwing here simulates a harness crash. */
  afterRun?: (runId: string) => void;
};

export type RunComparisonOptions = {
  /** Evidence store for campaign/action/finding rows and the §9.5 benchmark tables. Default: fresh in-memory store. */
  store?: EvidenceStore;
  /** Monotonic ms clock; only used for wallSeconds and the maxWallSeconds budget. */
  now?: () => number;
  /** Operator stop hook, checked before each action. */
  shouldAbort?: (runId: string, actionsTaken: number) => boolean;
  hooks?: RunComparisonHooks;
};

export type ComparisonRunResult = {
  /** Exported from the store (§9.5), not assembled in memory. */
  report: ComparisonReportV2;
  traces: OfflineRunTrace[];
  store: EvidenceStore;
};

function provenanceFor(arm: BenchmarkArm): ProvenanceMode {
  if (arm === "scripted_known") return "scripted";
  if (arm === "seeded_random") return "recorded";
  return "live";
}

function baseRecord(plan: ComparisonPlan, planned: PlannedRun, settingsKey: string) {
  return {
    schemaVersion: 1 as const,
    contractVersion: 2 as const,
    comparisonId: plan.comparisonId,
    runId: planned.runId,
    arm: planned.arm,
    target: planned.target,
    explorerSeed: planned.explorerSeed,
    settingsKey,
    provenance: provenanceFor(planned.arm),
  };
}

/** targetId the in-process fixture (and replayBundle's hard-coded labels) uses for each mode. */
export const RB015_SYNTHETIC_TARGET_IDS: Readonly<Record<BenchmarkTarget["fixtureMode"], string>> = {
  faulty: "synthetic-trade-faulty",
  fixed: "synthetic-trade-fixed",
};

/**
 * The runner only knows how to build the in-repo synthetic fixtures. Any other buildId or a
 * targetId that doesn't match the fixture mode ends the run as `error`, so the replay path's
 * hard-coded `synthetic-trade-*` labels are a checked fact rather than an assumption.
 */
export function targetIdentityProblem(target: BenchmarkTarget, family: SyntheticTargetFamily = "trade"): string | null {
  if (target.buildId !== RB015_BUILD_ID)
    return `unsupported buildId ${target.buildId} (runner builds only ${RB015_BUILD_ID})`;
  const expected = SYNTHETIC_TARGET_IDS[family][target.fixtureMode];
  if (target.targetId !== expected)
    return `targetId ${target.targetId} does not match ${target.fixtureMode} fixture ${expected}`;
  return null;
}

function settingsProblem(settings: ComparableSettings): string | null {
  const family = targetFamilyForSettings(settings);
  if (!family) return `unknown rulePackId ${settings.rulePackId}`;
  if (settings.rulePackVersion !== rulePackForTargetFamily(family).version)
    return `unknown rulePackVersion ${settings.rulePackVersion}`;
  if (settings.resetProcedureId !== RESET_PROCEDURE_IDS[family])
    return `unknown resetProcedureId ${settings.resetProcedureId}`;
  if (family === "trade" && settings.toolAccess.includes("reward_claim"))
    return "reward_claim is only available on the reward target pair";
  return null;
}

/** reward_claim args, parsed like an explorer tool call: authority fields first, then the strict schema. */
function parseRewardClaimArgs(raw: unknown): { ok: true; params: Record<string, unknown> } | { ok: false } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ok: false };
  if (!assertNoAuthorityFields(raw as Record<string, unknown>).ok) return { ok: false };
  const parsed = RewardClaimParamsSchema.safeParse(raw);
  return parsed.success ? { ok: true, params: parsed.data } : { ok: false };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function executeOfflineRun(
  plan: ComparisonPlan,
  planned: PlannedRun,
  armConfig: ArmConfig | undefined,
  settingsKey: string,
  store: EvidenceStore,
  options: RunComparisonOptions,
): { record: RunRecordV2; trace: OfflineRunTrace; campaignCreated: boolean } {
  const now = options.now ?? (() => globalThis.performance.now());
  const hooks = options.hooks ?? {};
  const settings = plan.settings;
  const started = now();
  const calls: string[] = [];
  const toolsUsed = new Set<BenchmarkToolName>();
  let stopReason: StopReason = "error";
  let loopError: string | undefined;
  let replayError: string | undefined;
  let actionsTaken = 0;
  let violation: InvariantViolation | null = null;
  let violationIndex = -1;
  let findings: RunRecordV2["findings"] = [];
  let finalStateHash: string | undefined;
  let campaignCreated = false;
  const campaignId = `${plan.comparisonId}--${planned.runId}`;
  const world = initialWorldForSeed(settings.worldSeed);
  const allowed = new Set(settings.toolAccess);
  let target: CoordinatorTargetAdapter | null = null;
  const family: SyntheticTargetFamily = targetFamilyForSettings(settings) ?? "trade";

  // ---- Action loop. Any throw in here is a loop error: stopReason "error", no replay. ----
  try {
    const problem = settingsProblem(settings);
    if (problem) throw new Error(problem);
    if (campaignId.length > 128) throw new Error("comparisonId--runId exceeds 128 chars");
    if (!armConfig || armConfig.arm !== planned.arm) throw new Error(`no arm config for ${planned.arm}`);
    const targetProblem = targetIdentityProblem(planned.target, family);
    if (targetProblem) throw new Error(targetProblem);
    if (family === "reward" && armConfig.arm === "scripted_known" && armConfig.scriptId !== RB016_KNOWN_REWARD_SCRIPT_ID)
      throw new Error(`unknown scriptId ${armConfig.scriptId} for the reward pair`);

    target = createTarget(family, planned.target.fixtureMode);
    const initial = target.initialize(world);
    if (hashWorldState(initial) !== settings.initialStateHash)
      throw new Error("reset state does not match initialStateHash");

    const runner = new ScriptedCampaignRunner(
      {
        campaignId,
        dbPath: ":memory:",
        fixtureMode: planned.target.fixtureMode,
        steps: [],
        mode: provenanceFor(planned.arm),
        targetFamily: family,
        rulePack: rulePackForTargetFamily(family),
      },
      store,
      target,
    );
    campaignCreated = true;
    const explorer =
      armConfig.arm === "scripted_known"
        ? scriptedKnownExplorer(family === "reward" ? knownRewardDoubleClaimSteps() : knownTradeFailureSteps())
        : armConfig.arm === "seeded_random" && family === "trade"
          ? seededRandomExplorer(
              new SeededChooser(armConfig.generatorId, planned.explorerSeed),
              settings.toolAccess,
              world,
            )
          : null;
    if (!explorer) throw new Error(`arm ${planned.arm} is not an offline arm`);
    if (armConfig.arm === "seeded_random" && armConfig.generatorId !== RB015_SEEDED_RANDOM_GENERATOR_ID)
      throw new Error(`unknown generatorId ${armConfig.generatorId}`);

    for (let i = 0; ; i += 1) {
      const call = explorer.next(i, target);
      // Tie-break (§9.2): an arm with nothing left to do stops "natural", even at exactly maxActions.
      if (!call) {
        stopReason = "natural";
        break;
      }
      if (actionsTaken >= settings.maxActions) {
        stopReason = "max_actions";
        break;
      }
      if (options.shouldAbort?.(planned.runId, actionsTaken)) {
        stopReason = "operator_abort";
        runner.requestStop();
        break;
      }
      if ((now() - started) / 1000 > settings.maxWallSeconds) {
        stopReason = "max_wall_seconds";
        break;
      }
      // Refused before dispatch (§9.3): not an action, not in toolsUsed, named in errorMessage.
      if (!allowed.has(call.tool))
        throw new Error(`tool ${call.tool} refused before dispatch: not in toolAccess`);
      hooks.beforeAction?.(planned.runId, actionsTaken);

      actionsTaken += 1;
      toolsUsed.add(call.tool);
      calls.push(`${call.actorId}:${call.tool}:${canonicalJson(call.args)}`);
      const parsed = call.tool === "reward_claim" ? parseRewardClaimArgs(call.args) : parseExplorerToolArgs(call.tool, call.args);
      if (!parsed.ok) continue; // rejected at the tool boundary; still a counted action

      if (!MUTATING_TOOLS.has(call.tool)) {
        if (call.tool === "economy_observe") bindActor(target, call.actorId).inspectForActor(call.actorId);
        continue;
      }
      const envelope = makeEnvelope(
        campaignId,
        { actorId: call.actorId, kind: call.tool as ScriptedStep["kind"], params: parsed.params },
        i + 1,
      );
      const submitted = runner.submit(envelope);
      if (submitted.result.outcome === "target_error")
        throw new Error(`target_error: ${submitted.result.domainCode ?? "unknown"}`);
      if (!submitted.verificationOk) {
        violation = submitted.violations[0] ?? null;
        violationIndex = actionsTaken - 1;
        // Tie-break (§9.2): a violation on the last allowed step is still first_violation.
        stopReason = "first_violation";
        break; // runner froze
      }
    }
  } catch (err) {
    stopReason = "error";
    loopError = messageOf(err);
  }

  const forcedStop = stopReason === "error" || stopReason === "operator_abort";

  // ---- Post-loop. Replay only after a normal loop end with a violation. ----
  if (violation) {
    const candidate = store.getFinding(campaignId);
    const candidateFinding = {
      findingId: candidate?.findingId ?? `finding-${campaignId}`,
      status: "candidate" as const,
      invariantId: violation.invariantId,
      firstActionIndex: violationIndex,
    };
    if (forcedStop) {
      findings = [candidateFinding]; // no replay after a forced stop (§9.1)
    } else {
      try {
        hooks.beforeReplay?.(planned.runId);
        // RB-013 confirmation: replay the persisted trace on the same fixture build.
        const bundle = loadBundleFromStore(store, campaignId);
        const replay = replayBundle(bundle, {
          fixtureMode: planned.target.fixtureMode,
          requireHashMatch: true,
          sameBuildConfirmation: true,
          targetFamily: family,
          rulePack: rulePackForTargetFamily(family),
        });
        const finding = applyConfirmingReplay(store, campaignId, replay);
        if (!finding) throw new Error("violation recorded without a finding");
        findings = [{ ...candidateFinding, findingId: finding.findingId, status: finding.status }];
      } catch (err) {
        replayError = messageOf(err);
        findings = [candidateFinding]; // keeps first_violation; finding stays candidate
      }
    }
  }

  if (campaignCreated && !violation) {
    const campaign = store.getCampaign(campaignId);
    if (campaign && stopReason !== "operator_abort")
      store.updateCampaign(
        { ...campaign, status: stopReason === "error" ? "failed" : "completed" },
        stopReason === "error" ? "error" : stopReason === "natural" ? "no_violation_observed" : "budget_exhausted",
      );
  }

  if (target) {
    try {
      // Includes an abort before the first action: this is the reset-state hash.
      finalStateHash = hashWorldState(target.snapshotForVerifier());
    } catch {
      // leave unset; the schema only allows that for an error before the first action
    }
    target.dispose();
  }

  const outcome = resolveOutcomeV2(stopReason, {
    confirmed: findings.some((f) => f.status === "confirmed"),
    error: replayError !== undefined,
    notReproduced: findings.some((f) => f.status === "not_reproduced" || f.status === "inconclusive"),
    candidate: findings.some((f) => f.status === "candidate"),
  });
  const rawError = loopError ?? replayError;
  const errorMessage = outcome === "error" && rawError ? truncateErrorMessage(rawError) : undefined;
  const wallSeconds = Math.max(0, Math.round(now() - started)) / 1000;
  const record = RunRecordV2Schema.parse({
    ...baseRecord(plan, planned, settingsKey),
    outcome,
    stopReason,
    ...(errorMessage ? { errorMessage } : {}),
    actionsTaken,
    wallSeconds,
    costUsd: 0,
    toolsUsed: [...toolsUsed].sort(),
    findings,
    ...(finalStateHash ? { finalStateHash } : {}),
  });
  return {
    record,
    trace: { runId: planned.runId, calls, ...(rawError ? { errorMessage: truncateErrorMessage(rawError) } : {}) },
    campaignCreated,
  };
}

/** Why a planned run is recorded as not_run without executing, or null if it runs. */
function notRunReasonFor(family: SyntheticTargetFamily | null, arm: BenchmarkArm): string | null {
  if (family === "reward") {
    if (arm === "scripted_known") return null;
    return OFFLINE_ARMS.includes(arm) ? REWARD_NO_TOOL_NOT_RUN_REASON : REWARD_NO_TOOL_LLM_NOT_RUN_REASON;
  }
  return OFFLINE_ARMS.includes(arm) ? null : LIVE_GATE_NOT_RUN_REASON;
}

/**
 * Run every planned run in plan order and export the report from the store.
 * Writes the plan row before the first run and one insert-only run row per planned run (§9.5).
 */
export function runComparison(
  planInput: ComparisonPlan,
  options: RunComparisonOptions = {},
): ComparisonRunResult {
  const plan = ComparisonPlanSchema.parse(planInput);
  const settingsKey = comparableSettingsKey(plan.settings);
  const store = options.store ?? new EvidenceStore(":memory:");
  if (store.hasBenchmarkComparison(plan.comparisonId))
    throw new Error(`comparison ${plan.comparisonId} already exists in this store; use a new comparisonId or a fresh store`);
  store.insertBenchmarkComparison({ planJson: canonicalJson(plan), settingsKey });

  const armConfigs = new Map(plan.arms.map((a) => [a.arm, a] as const));
  const traces: OfflineRunTrace[] = [];
  const family = targetFamilyForSettings(plan.settings);

  for (const planned of plan.plannedRuns) {
    const notRunReason = notRunReasonFor(family, planned.arm);
    if (notRunReason) {
      const record = RunRecordV2Schema.parse({
        ...baseRecord(plan, planned, settingsKey),
        outcome: "not_run",
        stopReason: "not_run",
        notRunReason,
        actionsTaken: 0,
        wallSeconds: 0,
        costUsd: 0,
        toolsUsed: [],
        findings: [],
      });
      store.insertBenchmarkRun({ recordJson: canonicalJson(record), campaignId: null });
      traces.push({ runId: planned.runId, calls: [] });
      options.hooks?.afterRun?.(planned.runId);
      continue;
    }
    const { record, trace, campaignCreated } = executeOfflineRun(
      plan,
      planned,
      armConfigs.get(planned.arm),
      settingsKey,
      store,
      options,
    );
    const campaignId = `${plan.comparisonId}--${planned.runId}`;
    store.insertBenchmarkRun({
      recordJson: canonicalJson(record),
      campaignId: campaignCreated && store.getCampaign(campaignId) ? campaignId : null,
    });
    traces.push(trace);
    options.hooks?.afterRun?.(planned.runId);
  }

  return { report: store.exportBenchmarkReport(plan.comparisonId), traces, store };
}

// ---------------------------------------------------------------------------
// Default offline plan
// ---------------------------------------------------------------------------

export type DefaultPlanOptions = {
  comparisonId?: string;
  worldSeed?: string;
  explorerSeeds?: string[];
  maxActions?: number;
  maxWallSeconds?: number;
  /** Also plan llm_single/llm_dual cells; they are recorded as not_run. */
  includeLlmArms?: boolean;
};

export const DEFAULT_RB015_SEEDS = [
  "rb015-seed-01",
  "rb015-seed-02",
  "rb015-seed-03",
  "rb015-seed-04",
  "rb015-seed-05",
];

export function buildDefaultOfflinePlan(opts: DefaultPlanOptions = {}): ComparisonPlan {
  const worldSeed = opts.worldSeed ?? DEFAULT_INITIAL_WORLD.seed;
  const explorerSeeds = opts.explorerSeeds ?? [...DEFAULT_RB015_SEEDS];
  const comparisonId = opts.comparisonId ?? "rb015-offline-v2";
  const settings: ComparableSettings = {
    schemaVersion: 1,
    rulePackId: APPROVED_RULE_PACK_V1.rulePackId,
    rulePackVersion: APPROVED_RULE_PACK_V1.version,
    worldSeed,
    initialStateHash: initialStateHashFor(worldSeed),
    resetProcedureId: RB015_RESET_PROCEDURE_ID,
    toolAccess: ["economy_observe", "strategy_note", "trade_accept", "trade_cancel", "trade_create"],
    maxActions: opts.maxActions ?? 200,
    maxWallSeconds: opts.maxWallSeconds ?? 60,
    spendCapUsd: 0,
  };
  const arms: ArmConfig[] = [
    { arm: "scripted_known", scriptId: RB015_KNOWN_SCRIPT_ID },
    { arm: "seeded_random", generatorId: RB015_SEEDED_RANDOM_GENERATOR_ID },
  ];
  if (opts.includeLlmArms) {
    arms.push(
      { arm: "llm_single", modelId: "not-selected", promptVersion: "not-selected", provider: "not-selected" },
      { arm: "llm_dual", modelId: "not-selected", promptVersion: "not-selected", provider: "not-selected" },
    );
  }
  const targets: BenchmarkTarget[] = [
    { targetId: RB015_SYNTHETIC_TARGET_IDS.faulty, fixtureMode: "faulty", buildId: RB015_BUILD_ID },
    { targetId: RB015_SYNTHETIC_TARGET_IDS.fixed, fixtureMode: "fixed", buildId: RB015_BUILD_ID },
  ];
  const plannedRuns: PlannedRun[] = [];
  for (const { arm } of arms)
    for (const target of targets)
      for (const explorerSeed of explorerSeeds)
        plannedRuns.push({ runId: `${arm}--${target.fixtureMode}--${explorerSeed}`, arm, target, explorerSeed });

  return ComparisonPlanSchema.parse({
    schemaVersion: 1,
    comparisonId,
    settings,
    arms,
    targets,
    explorerSeeds,
    plannedRuns,
    heldBackVariations:
      "Nothing is held back: offline arms receive no prompts. The only fixture defect is the RB-006 " +
      "cancel-after-accept duplicate (INV-003), which scripted_known is hand-written to hit. " +
      "Engineering check only, not evidence of general exploit-detection performance.",
  });
}

// ---------------------------------------------------------------------------
// RB-016 reward-pair plan (a separate comparison with its own settings key)
// ---------------------------------------------------------------------------

export const DEFAULT_RB016_SEEDS = [
  "rb016-seed-01",
  "rb016-seed-02",
  "rb016-seed-03",
  "rb016-seed-04",
  "rb016-seed-05",
];

export type RewardPlanOptions = Omit<DefaultPlanOptions, "includeLlmArms">;

/**
 * RB-016 reward pair: every arm × synthetic-reward-faulty + synthetic-reward-fixed × seeds, verified
 * with rulebreak-reward-v1. Only scripted_known executes; the other arms are recorded as not_run
 * (no reward_claim explorer tool). Its settings key differs from the RB-015 trade comparison, so it is
 * a new comparison, not a rerun.
 */
export function buildRewardOfflinePlan(opts: RewardPlanOptions = {}): ComparisonPlan {
  const worldSeed = opts.worldSeed ?? DEFAULT_INITIAL_WORLD.seed;
  const explorerSeeds = opts.explorerSeeds ?? [...DEFAULT_RB016_SEEDS];
  const comparisonId = opts.comparisonId ?? "rb-016-reward-offline-v1";
  const settings: ComparableSettings = {
    schemaVersion: 1,
    rulePackId: APPROVED_RULE_PACK_REWARD_V1.rulePackId,
    rulePackVersion: APPROVED_RULE_PACK_REWARD_V1.version,
    worldSeed,
    initialStateHash: initialStateHashFor(worldSeed, "reward"),
    resetProcedureId: RB016_REWARD_RESET_PROCEDURE_ID,
    toolAccess: ["economy_observe", "reward_claim", "strategy_note", "trade_accept", "trade_cancel", "trade_create"],
    maxActions: opts.maxActions ?? 200,
    maxWallSeconds: opts.maxWallSeconds ?? 60,
    spendCapUsd: 0,
  };
  const arms: ArmConfig[] = [
    { arm: "scripted_known", scriptId: RB016_KNOWN_REWARD_SCRIPT_ID },
    { arm: "seeded_random", generatorId: RB015_SEEDED_RANDOM_GENERATOR_ID },
    { arm: "llm_single", modelId: "not-selected", promptVersion: "not-selected", provider: "not-selected" },
    { arm: "llm_dual", modelId: "not-selected", promptVersion: "not-selected", provider: "not-selected" },
  ];
  const targets: BenchmarkTarget[] = [
    { targetId: RB016_REWARD_TARGET_IDS.faulty, fixtureMode: "faulty", buildId: RB015_BUILD_ID },
    { targetId: RB016_REWARD_TARGET_IDS.fixed, fixtureMode: "fixed", buildId: RB015_BUILD_ID },
  ];
  const plannedRuns: PlannedRun[] = [];
  for (const { arm } of arms)
    for (const target of targets)
      for (const explorerSeed of explorerSeeds)
        plannedRuns.push({ runId: `${arm}--${target.fixtureMode}--${explorerSeed}`, arm, target, explorerSeed });

  return ComparisonPlanSchema.parse({
    schemaVersion: 1,
    comparisonId,
    settings,
    arms,
    targets,
    explorerSeeds,
    plannedRuns,
    heldBackVariations:
      "Nothing is held back: no arm receives prompts. The only reward-fixture defect is the RB-016 " +
      "double-claim (a new idempotency key grants the same reward again, INV-006), which scripted_known " +
      "is hand-written to hit at action 4. seeded_random and the LLM arms have no reward_claim tool and " +
      "are not_run. Engineering check only, not a detection rate.",
  });
}
