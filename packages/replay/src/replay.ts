import {
  APPROVED_RULE_PACK_REWARD_V1,
  APPROVED_RULE_PACK_V1,
  type ActionEnvelope,
  type ActionResult,
  type Finding,
  type InvariantViolation,
  type ReplayResult,
  type RulePack,
  type WorldState,
} from "@rulebreak/contracts";
import {
  SYNTHETIC_TARGET_IDS,
  createFixedTargetAdapter,
  createSyntheticTargetAdapter,
  type CoordinatorTargetAdapter,
  type SyntheticTargetFamily,
} from "@rulebreak/economy";
import type { EvidenceStore, PersistedActionRow } from "@rulebreak/evidence";
import { hashWorldState, verifyTransition } from "@rulebreak/verifier";

export type TraceAction = {
  sequence: number;
  envelope: ActionEnvelope;
  recordedResult: ActionResult;
  recordedPreStateHash: string;
  recordedPostStateHash: string;
};

export type EvidenceBundle = {
  finding: Finding;
  initialState: WorldState;
  trace: TraceAction[];
  violation: InvariantViolation;
  sourceCampaignId: string;
  harnessVersion: string;
};

export type ReplayOptions = {
  fixtureMode: "fixed" | "faulty";
  /** When true, require per-step post hashes to match the original vulnerable run. */
  requireHashMatch?: boolean;
  /**
   * RB-015: when replaying on the fixed build that produced the candidate itself
   * (same-build confirmation), a reproduced matching violation is reported as
   * `matched_violation` instead of the control-style `error`. Default false keeps the
   * RB-008 fixed-control semantics unchanged.
   */
  sameBuildConfirmation?: boolean;
  /**
   * RB-016: which synthetic target pair to replay on. Default "trade" keeps the P0 trade
   * targets, labels and confirmation path unchanged.
   */
  targetFamily?: SyntheticTargetFamily;
  /** Rule pack to verify with. Default: the family's pack (trade: rulebreak-trade-v1). */
  rulePack?: RulePack;
  /**
   * RB-017: read-only observer, called once per replayed step after the independent verifier
   * has checked it. It cannot change the replay: the target, verifier, rule pack and outcome
   * logic are the same whether or not it is set. Default unset.
   */
  onStep?: (observed: Readonly<ReplayStepObservation>) => void;
  /**
   * RB-017: when true, a fresh target whose start state does not hash to `bundle.initialState`
   * ends the replay with outcome `error` before any step runs. Default false keeps the existing
   * fallback (replay continues from the freshly initialised world) for every other caller.
   */
  requireStartHashMatch?: boolean;
};

/** What the replay saw for one step (RB-017 reducer). */
export type ReplayStepObservation = {
  index: number;
  step: TraceAction;
  result: ActionResult;
  verificationOk: boolean;
  violation: InvariantViolation | null;
};

/** Approved rule pack each synthetic target family is verified with. */
export function rulePackForTargetFamily(family: SyntheticTargetFamily): RulePack {
  return family === "reward" ? APPROVED_RULE_PACK_REWARD_V1 : APPROVED_RULE_PACK_V1;
}

export function loadBundleFromStore(
  store: EvidenceStore,
  campaignId: string,
): EvidenceBundle {
  const finding = store.getFinding(campaignId);
  const violation = store.getViolation(campaignId);
  const initialState = store.getInitialWorld(campaignId);
  if (!finding || !violation || !initialState) {
    throw new Error(`campaign ${campaignId} is missing finding/violation/initial world`);
  }
  const actions = store.listActions(campaignId);
  if (actions.length === 0) {
    throw new Error(`campaign ${campaignId} has no persisted actions`);
  }
  return {
    finding,
    violation,
    initialState,
    sourceCampaignId: campaignId,
    harnessVersion: "rulebreak-replay-0.1.0",
    trace: actions.map((row) => rowToTrace(row)),
  };
}

function rowToTrace(row: PersistedActionRow): TraceAction {
  return {
    sequence: row.sequence,
    envelope: JSON.parse(row.envelopeJson) as ActionEnvelope,
    recordedResult: JSON.parse(row.resultJson) as ActionResult,
    recordedPreStateHash: row.preStateHash,
    recordedPostStateHash: row.postStateHash,
  };
}

function createTarget(family: SyntheticTargetFamily, mode: "fixed" | "faulty"): CoordinatorTargetAdapter {
  return createSyntheticTargetAdapter(family, mode);
}

export function replayBundle(
  bundle: EvidenceBundle,
  options: ReplayOptions,
): ReplayResult {
  const family: SyntheticTargetFamily = options.targetFamily ?? "trade";
  const ids = SYNTHETIC_TARGET_IDS[family];
  const rulePack = options.rulePack ?? rulePackForTargetFamily(family);
  const target = createTarget(family, options.fixtureMode);
  target.initialize({
    schemaVersion: 1,
    players: ["player-a", "player-b"],
    startingCurrency: bundle.initialState.balances["player-a"] ?? 100,
    uniqueItemId: bundle.initialState.itemOccurrences[0]?.itemId ?? "relic-001",
    ownerId:
      bundle.initialState.itemOccurrences[0]?.location.kind === "player"
        ? bundle.initialState.itemOccurrences[0].location.playerId
        : "player-a",
    seed: bundle.initialState.seed,
  });

  // Ensure we start from the recorded initial snapshot.
  const startHash = hashWorldState(target.snapshotForVerifier());
  const expectedStart = hashWorldState(bundle.initialState);
  if (startHash !== expectedStart) {
    if (options.requireStartHashMatch) {
      return {
        schemaVersion: 1,
        findingId: bundle.finding.findingId,
        targetId: options.fixtureMode === "faulty" ? ids.faulty : ids.fixed,
        outcome: "error",
        message: "start state hash does not match the bundle's initial state",
        finalStateHash: startHash,
      };
    }
    // Fall back: still execute from freshly initialized default-equivalent world.
    // Scripted P0 worlds are deterministic from seed/defaults.
  }

  let lastViolation: InvariantViolation | null = null;
  let finalHash = hashWorldState(target.snapshotForVerifier());
  const replayedResults: ActionResult[] = [];

  for (const step of bundle.trace) {
    const envelope: ActionEnvelope = {
      ...step.envelope,
      campaignId: `replay-${bundle.sourceCampaignId}`,
      transportDispatchId: `replay-${step.envelope.transportDispatchId}`,
    };
    const execution = target.execute(envelope);
    const verification = verifyTransition({
      preState: execution.preState,
      envelope,
      result: execution.result,
      postState: execution.postState,
      rulePack,
    });
    replayedResults.push(execution.result);
    finalHash = verification.postStateHash;
    options.onStep?.({
      index: replayedResults.length - 1,
      step,
      result: execution.result,
      verificationOk: verification.ok,
      violation: verification.ok ? null : (verification.violations[0] ?? null),
    });

    if (options.requireHashMatch && options.fixtureMode === "faulty") {
      if (verification.postStateHash !== step.recordedPostStateHash) {
        return {
          schemaVersion: 1,
          findingId: bundle.finding.findingId,
          targetId: options.fixtureMode === "faulty" ? ids.faulty : ids.fixed,
          outcome: "diverged",
          message: `post-state hash divergence at sequence ${step.sequence}`,
          finalStateHash: verification.postStateHash,
        };
      }
    }

    if (!verification.ok) {
      lastViolation = verification.violations[0] ?? null;
      break;
    }
  }

  if (options.fixtureMode === "faulty") {
    if (
      lastViolation &&
      lastViolation.invariantId === bundle.violation.invariantId
    ) {
      return {
        schemaVersion: 1,
        findingId: bundle.finding.findingId,
        targetId: ids.faulty,
        outcome: "matched_violation",
        message: `reproduced ${lastViolation.invariantId}`,
        finalStateHash: finalHash,
      };
    }
    return {
      schemaVersion: 1,
      findingId: bundle.finding.findingId,
      targetId: ids.faulty,
      outcome: lastViolation ? "diverged" : "error",
      message: lastViolation
        ? `expected ${bundle.violation.invariantId}, got ${lastViolation.invariantId}`
        : "expected violation was not reproduced",
      finalStateHash: finalHash,
    };
  }

  // Fixed target: the violating behavior should be blocked; invariants must hold.
  if (
    lastViolation &&
    options.sameBuildConfirmation &&
    lastViolation.invariantId === bundle.violation.invariantId
  ) {
    return {
      schemaVersion: 1,
      findingId: bundle.finding.findingId,
      targetId: ids.fixed,
      outcome: "matched_violation",
      message: `reproduced ${lastViolation.invariantId} on the fixed build`,
      finalStateHash: finalHash,
    };
  }
  if (lastViolation) {
    return {
      schemaVersion: 1,
      findingId: bundle.finding.findingId,
      targetId: ids.fixed,
      outcome: "error",
      message: `fixed target still violated ${lastViolation.invariantId}`,
      finalStateHash: finalHash,
    };
  }

  if (family === "reward") {
    // RB-016 fixed control: the claim that broke INV-006 on the faulty build must not be granted.
    const violatingIndex = bundle.trace.findIndex(
      (step) => step.envelope.logicalActionId === bundle.violation.logicalActionId,
    );
    const replayed = violatingIndex >= 0 ? replayedResults[violatingIndex] : undefined;
    if (!replayed) {
      return {
        schemaVersion: 1,
        findingId: bundle.finding.findingId,
        targetId: ids.fixed,
        outcome: "error",
        message: "violating claim not found in the replayed trace",
        finalStateHash: finalHash,
      };
    }
    if (replayed.outcome === "accepted") {
      return {
        schemaVersion: 1,
        findingId: bundle.finding.findingId,
        targetId: ids.fixed,
        outcome: "error",
        message: "fixed target still granted the over-entitlement claim",
        finalStateHash: finalHash,
      };
    }
    return {
      schemaVersion: 1,
      findingId: bundle.finding.findingId,
      targetId: ids.fixed,
      outcome: "blocked_as_expected",
      message: "recorded violation not reproduced; over-entitlement claim refused",
      finalStateHash: finalHash,
    };
  }

  const cancelStep = bundle.trace.find((step) => step.envelope.kind === "trade_cancel");
  if (cancelStep) {
    // Re-run only to inspect final cancel outcome on a fresh fixed target path already executed above.
    // The recorded faulty cancel was accepted; fixed should have domain_rejected on that step.
    const cancelIndex = bundle.trace.findIndex((step) => step.envelope.kind === "trade_cancel");
    const target2 = createFixedTargetAdapter();
    target2.initialize({
      schemaVersion: 1,
      players: ["player-a", "player-b"],
      startingCurrency: 100,
      uniqueItemId: "relic-001",
      ownerId: "player-a",
      seed: bundle.initialState.seed,
    });
    let cancelResult: ActionResult | null = null;
    for (let i = 0; i <= cancelIndex; i += 1) {
      const step = bundle.trace[i]!;
      const execution = target2.execute({
        ...step.envelope,
        campaignId: `replay-fixed-${bundle.sourceCampaignId}`,
        transportDispatchId: `replay-fixed-${step.envelope.transportDispatchId}`,
      });
      cancelResult = execution.result;
    }
    if (cancelResult?.outcome === "accepted") {
      return {
        schemaVersion: 1,
        findingId: bundle.finding.findingId,
        targetId: ids.fixed,
        outcome: "error",
        message: "fixed target still accepted the illegal cancel",
        finalStateHash: finalHash,
      };
    }
  }

  return {
    schemaVersion: 1,
    findingId: bundle.finding.findingId,
    targetId: ids.fixed,
    outcome: "blocked_as_expected",
    message: "recorded violation not reproduced; illegal cancel blocked",
    finalStateHash: finalHash,
  };
}

/** Legitimate create→accept still works on fixed target (control). */
export function legitimateTradeWorks(): boolean {
  const target = createFixedTargetAdapter();
  const create = target.execute({
    schemaVersion: 1,
    campaignId: "legit",
    worldId: "world-legit",
    actorId: "player-a",
    logicalActionId: "a1",
    transportDispatchId: "d1",
    kind: "trade_create",
    params: { itemId: "relic-001", counterpartyId: "player-b", price: 10 },
  });
  const accept = target.execute({
    schemaVersion: 1,
    campaignId: "legit",
    worldId: "world-legit",
    actorId: "player-b",
    logicalActionId: "a2",
    transportDispatchId: "d2",
    kind: "trade_accept",
    params: { tradeId: "trade-0001" },
  });
  return create.result.outcome === "accepted" && accept.result.outcome === "accepted";
}
