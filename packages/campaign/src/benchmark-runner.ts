/**
 * RB-015 offline benchmark runner (v1).
 *
 * Takes a `ComparisonPlan` and produces a `ComparisonReport` with exactly one `RunRecord`
 * per planned run. Contract: packages/contracts/src/benchmark.ts and
 * docs/contracts/rb-015-baseline.md.
 *
 * Offline only. Runs the two offline arms (`scripted_known`, `seeded_random`) against the
 * in-process synthetic trade fixtures through the existing scripted campaign path
 * (ScriptedCampaignRunner.submit → verifier → evidence store) and confirms candidates through
 * the existing RB-013 replay path (replayBundle → applyConfirmingReplay). LLM arms are always
 * recorded as `not_run`. There are no LLM, network, Thor or SSH calls here.
 *
 * Randomness: every explorer choice comes from one mulberry32 generator keyed from
 * (generatorId, explorerSeed). Wall-clock time is read only to report `wallSeconds` and to
 * enforce `maxWallSeconds`; it never influences a choice.
 */
import {
  APPROVED_RULE_PACK_V1,
  ComparisonPlanSchema,
  ComparisonReportSchema,
  DEFAULT_INITIAL_WORLD,
  OFFLINE_ARMS,
  RunRecordSchema,
  comparableSettingsKey,
  parseExplorerToolArgs,
  type ArmConfig,
  type BenchmarkArm,
  type BenchmarkTarget,
  type ComparableSettings,
  type ComparisonPlan,
  type ComparisonReport,
  type ExplorerToolName,
  type InitialWorld,
  type InvariantViolation,
  type PlannedRun,
  type PlayerId,
  type ProvenanceMode,
  type RunOutcomeKind,
  type RunRecord,
} from "@rulebreak/contracts";
import {
  bindActor,
  createFaultyFixtureTargetAdapter,
  createFixedTargetAdapter,
  type CoordinatorTargetAdapter,
} from "@rulebreak/economy";
import { EvidenceStore, applyConfirmingReplay } from "@rulebreak/evidence";
import { loadBundleFromStore, replayBundle } from "@rulebreak/replay";
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

const PLAYERS: readonly PlayerId[] = ["player-a", "player-b"];
const MUTATING_TOOLS = new Set<ExplorerToolName>(["trade_create", "trade_accept", "trade_cancel"]);

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

function createTarget(mode: BenchmarkTarget["fixtureMode"]): CoordinatorTargetAdapter {
  return mode === "faulty" ? createFaultyFixtureTargetAdapter() : createFixedTargetAdapter();
}

/** Hash of the world produced by the reset procedure for `worldSeed` (same for both fixtures). */
export function initialStateHashFor(worldSeed: string): string {
  const target = createFixedTargetAdapter();
  const hash = hashWorldState(target.initialize(initialWorldForSeed(worldSeed)));
  target.dispose();
  return hash;
}

// ---------------------------------------------------------------------------
// Outcome precedence (doc §4)
// ---------------------------------------------------------------------------

export type OutcomeFlags = {
  confirmed: boolean;
  error: boolean;
  aborted: boolean;
  budgetExhausted: boolean;
  candidate: boolean;
};

/** confirmed_finding > error > aborted > budget_exhausted > candidate_only > no_finding. */
export function resolveOutcome(flags: OutcomeFlags): Exclude<RunOutcomeKind, "not_run"> {
  if (flags.confirmed) return "confirmed_finding";
  if (flags.error) return "error";
  if (flags.aborted) return "aborted";
  if (flags.budgetExhausted) return "budget_exhausted";
  if (flags.candidate) return "candidate_only";
  return "no_finding";
}

// ---------------------------------------------------------------------------
// Explorer tool calls
// ---------------------------------------------------------------------------

export type ExplorerCall = {
  actorId: PlayerId;
  tool: ExplorerToolName;
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
  toolAccess: readonly ExplorerToolName[],
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

export type RunComparisonOptions = {
  /** Evidence store for campaign/action/finding rows. Default: fresh in-memory store. */
  store?: EvidenceStore;
  /** Monotonic ms clock; only used for wallSeconds and the maxWallSeconds budget. */
  now?: () => number;
  /** Operator stop hook, checked before each action. */
  shouldAbort?: (runId: string, actionsTaken: number) => boolean;
};

export type ComparisonRunResult = {
  report: ComparisonReport;
  traces: OfflineRunTrace[];
};

function provenanceFor(arm: BenchmarkArm): ProvenanceMode {
  if (arm === "scripted_known") return "scripted";
  if (arm === "seeded_random") return "recorded";
  return "live";
}

function baseRecord(plan: ComparisonPlan, planned: PlannedRun, settingsKey: string) {
  return {
    schemaVersion: 1 as const,
    comparisonId: plan.comparisonId,
    runId: planned.runId,
    arm: planned.arm,
    target: planned.target,
    explorerSeed: planned.explorerSeed,
    settingsKey,
    provenance: provenanceFor(planned.arm),
  };
}

function settingsProblem(settings: ComparableSettings): string | null {
  if (settings.rulePackId !== APPROVED_RULE_PACK_V1.rulePackId)
    return `unknown rulePackId ${settings.rulePackId}`;
  if (settings.rulePackVersion !== APPROVED_RULE_PACK_V1.version)
    return `unknown rulePackVersion ${settings.rulePackVersion}`;
  if (settings.resetProcedureId !== RB015_RESET_PROCEDURE_ID)
    return `unknown resetProcedureId ${settings.resetProcedureId}`;
  return null;
}

function executeOfflineRun(
  plan: ComparisonPlan,
  planned: PlannedRun,
  armConfig: ArmConfig | undefined,
  settingsKey: string,
  store: EvidenceStore,
  options: RunComparisonOptions,
): { record: RunRecord; trace: OfflineRunTrace } {
  const now = options.now ?? (() => globalThis.performance.now());
  const settings = plan.settings;
  const started = now();
  const calls: string[] = [];
  let errorMessage: string | undefined;
  let actionsTaken = 0;
  let aborted = false;
  let budgetExhausted = false;
  let violation: InvariantViolation | null = null;
  let violationIndex = -1;
  let findings: RunRecord["findings"] = [];
  let finalStateHash: string | undefined;
  const campaignId = `${plan.comparisonId}--${planned.runId}`;
  const world = initialWorldForSeed(settings.worldSeed);
  const allowed = new Set(settings.toolAccess);
  let target: CoordinatorTargetAdapter | null = null;

  try {
    const problem = settingsProblem(settings);
    if (problem) throw new Error(problem);
    if (campaignId.length > 128) throw new Error("comparisonId--runId exceeds 128 chars");
    if (!armConfig || armConfig.arm !== planned.arm) throw new Error(`no arm config for ${planned.arm}`);

    target = createTarget(planned.target.fixtureMode);
    const initial = target.initialize(world);
    if (hashWorldState(initial) !== settings.initialStateHash)
      throw new Error("reset state does not match initialStateHash");

    const runner = new ScriptedCampaignRunner(
      { campaignId, dbPath: ":memory:", fixtureMode: planned.target.fixtureMode, steps: [] },
      store,
      target,
    );
    const explorer =
      armConfig.arm === "scripted_known"
        ? scriptedKnownExplorer(knownTradeFailureSteps())
        : armConfig.arm === "seeded_random"
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
      if (!call) break; // natural stop
      if (actionsTaken >= settings.maxActions) {
        budgetExhausted = true;
        break;
      }
      if (options.shouldAbort?.(planned.runId, actionsTaken)) {
        aborted = true;
        runner.requestStop();
        break;
      }
      if ((now() - started) / 1000 > settings.maxWallSeconds) {
        budgetExhausted = true;
        break;
      }
      if (!allowed.has(call.tool)) throw new Error(`tool ${call.tool} is not in toolAccess`);

      actionsTaken += 1;
      calls.push(`${call.actorId}:${call.tool}:${canonicalJson(call.args)}`);
      const parsed = parseExplorerToolArgs(call.tool, call.args);
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
        break; // runner froze; natural stop on first violation
      }
    }

    if (!violation && !aborted) {
      const campaign = store.getCampaign(campaignId);
      if (campaign)
        store.updateCampaign(
          { ...campaign, status: "completed" },
          budgetExhausted ? "budget_exhausted" : "no_violation_observed",
        );
    }

    if (violation) {
      // RB-013 confirmation: replay the persisted trace on the same fixture build.
      const bundle = loadBundleFromStore(store, campaignId);
      const replay = replayBundle(bundle, {
        fixtureMode: planned.target.fixtureMode,
        requireHashMatch: true,
        sameBuildConfirmation: true,
      });
      const finding = applyConfirmingReplay(store, campaignId, replay);
      if (!finding) throw new Error("violation recorded without a finding");
      findings = [
        {
          findingId: finding.findingId,
          status: finding.status,
          invariantId: violation.invariantId,
          firstActionIndex: violationIndex,
        },
      ];
    }
    finalStateHash = hashWorldState(target.snapshotForVerifier());
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    if (target) {
      try {
        finalStateHash = hashWorldState(target.snapshotForVerifier());
      } catch {
        // target already disposed; leave finalStateHash unset
      }
    }
  } finally {
    target?.dispose();
  }

  const outcome = resolveOutcome({
    confirmed: findings.some((f) => f.status === "confirmed"),
    error: errorMessage !== undefined,
    aborted,
    budgetExhausted,
    candidate: findings.some((f) => f.status === "candidate"),
  });
  const wallSeconds = Math.max(0, Math.round(now() - started)) / 1000;
  const record = RunRecordSchema.parse({
    ...baseRecord(plan, planned, settingsKey),
    outcome,
    actionsTaken,
    wallSeconds,
    costUsd: 0,
    findings,
    ...(finalStateHash ? { finalStateHash } : {}),
  });
  return {
    record,
    trace: { runId: planned.runId, calls, ...(errorMessage ? { errorMessage } : {}) },
  };
}

/** Run every planned run in plan order. Exactly one RunRecord per planned run. */
export function runComparison(
  planInput: ComparisonPlan,
  options: RunComparisonOptions = {},
): ComparisonRunResult {
  const plan = ComparisonPlanSchema.parse(planInput);
  const settingsKey = comparableSettingsKey(plan.settings);
  const store = options.store ?? new EvidenceStore(":memory:");
  const armConfigs = new Map(plan.arms.map((a) => [a.arm, a] as const));
  const runs: RunRecord[] = [];
  const traces: OfflineRunTrace[] = [];

  for (const planned of plan.plannedRuns) {
    if (!OFFLINE_ARMS.includes(planned.arm)) {
      runs.push(
        RunRecordSchema.parse({
          ...baseRecord(plan, planned, settingsKey),
          outcome: "not_run",
          notRunReason: LIVE_GATE_NOT_RUN_REASON,
          actionsTaken: 0,
          wallSeconds: 0,
          costUsd: 0,
          findings: [],
        }),
      );
      traces.push({ runId: planned.runId, calls: [] });
      continue;
    }
    const { record, trace } = executeOfflineRun(
      plan,
      planned,
      armConfigs.get(planned.arm),
      settingsKey,
      store,
      options,
    );
    runs.push(record);
    traces.push(trace);
  }

  const report = ComparisonReportSchema.parse({ schemaVersion: 1, plan, runs });
  return { report, traces };
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
  const comparisonId = opts.comparisonId ?? "rb015-offline-v1";
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
    { targetId: "synthetic-trade-faulty", fixtureMode: "faulty", buildId: RB015_BUILD_ID },
    { targetId: "synthetic-trade-fixed", fixtureMode: "fixed", buildId: RB015_BUILD_ID },
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
