/**
 * RB-017 bounded trace reduction.
 *
 * Deletes ranges of actions from a confirmed evidence bundle's trace and replays every candidate
 * with the existing replay path (replayBundle on the faulty build) and the independent verifier.
 * A candidate is accepted only if the same violation reproduces on the same final action, and
 * every kept action gets the same result it got in the original run. Anything else is rejected.
 *
 * Offline and deterministic: no model, network or platform randomness. Wall-clock time is read
 * only to enforce the timeout. The result is "reduced", never claimed to be the shortest trace.
 * See docs/contracts/rb-017-trace-reduction.md.
 */
import type { ActionResult, RulePack } from "@rulebreak/contracts";
import type { SyntheticTargetFamily } from "@rulebreak/economy";
import { replayBundle, type EvidenceBundle, type ReplayStepObservation, type TraceAction } from "./replay.js";

export type ReductionBounds = {
  /** Most replays per trace, the baseline replay of the original included. */
  maxReplays: number;
  /** Wall-clock timeout per trace, in milliseconds. */
  maxWallMs: number;
};

export const RB017_DEFAULT_BOUNDS: ReductionBounds = { maxReplays: 100, maxWallMs: 10_000 };

export type ReductionOptions = {
  targetFamily: SyntheticTargetFamily;
  rulePack: RulePack;
  bounds?: ReductionBounds;
  /** Monotonic ms clock, only for the timeout. Default performance.now. */
  now?: () => number;
};

export type ReductionAttempt = {
  /** 1-based replay number; replay 1 is the baseline replay of the original trace. */
  replay: number;
  /** Sequences (original numbering) removed in this candidate, relative to the trace being reduced. */
  removedSequences: number[];
  candidateLength: number;
  accepted: boolean;
  reason: string;
};

export type ReductionStopReason =
  | "no_single_action_removable"
  | "only_violating_action_left"
  | "replay_cap"
  | "timeout"
  | "baseline_rejected";

export type ReductionResult = {
  status: "reduced" | "not_reduced";
  stopReason: ReductionStopReason;
  originalLength: number;
  reducedLength: number;
  replaysUsed: number;
  bounds: ReductionBounds;
  /** The kept actions, unchanged objects from the original trace, in original order. */
  reducedTrace: TraceAction[];
  attempts: ReductionAttempt[];
};

type Verdict = { accepted: boolean; reason: string };

function sameResult(recorded: ActionResult, replayed: ActionResult): boolean {
  return (
    recorded.outcome === replayed.outcome &&
    recorded.domainCode === replayed.domainCode &&
    recorded.message === replayed.message
  );
}

/**
 * Replays `trace` from the bundle's initial state and applies the acceptance rules:
 * 0. the replay starts from the bundle's initial state (requireStartHashMatch), and does not throw;
 * 1. replayBundle on the faulty build returns matched_violation for the bundle's invariant;
 * 2. the first violation is on the bundle's violating action (same logicalActionId and invariant),
 *    and that action is the last one in the candidate;
 * 3. every kept action replays with the same outcome, domainCode and message as recorded, so a
 *    failed precondition, a missing setup object or a changed object id rejects the candidate.
 */
export function checkCandidate(
  bundle: EvidenceBundle,
  trace: TraceAction[],
  options: Pick<ReductionOptions, "targetFamily" | "rulePack"> & { requireHashMatch?: boolean },
): Verdict {
  const last = trace[trace.length - 1];
  if (!last || last.envelope.logicalActionId !== bundle.violation.logicalActionId)
    return { accepted: false, reason: "the violating action is not the last action" };
  const observed: Readonly<ReplayStepObservation>[] = [];
  let replay: ReturnType<typeof replayBundle>;
  try {
    replay = replayBundle(
      { ...bundle, trace },
      {
        fixtureMode: "faulty",
        targetFamily: options.targetFamily,
        rulePack: options.rulePack,
        requireStartHashMatch: true,
        ...(options.requireHashMatch ? { requireHashMatch: true } : {}),
        onStep: (o) => observed.push(o),
      },
    );
  } catch (err) {
    // A throw from the replay or the observer is a rejected candidate; the replay still counts.
    return { accepted: false, reason: `replay threw: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (replay.outcome !== "matched_violation")
    return { accepted: false, reason: `replay ${replay.outcome}: ${replay.message ?? ""}`.trim() };
  for (const o of observed) {
    if (!sameResult(o.step.recordedResult, o.result))
      return {
        accepted: false,
        reason:
          `precondition changed at ${o.step.envelope.logicalActionId}: recorded ${o.step.recordedResult.outcome} ` +
          `${o.step.recordedResult.domainCode ?? ""}, replayed ${o.result.outcome} ${o.result.domainCode ?? ""}`,
      };
  }
  const firstViolation = observed.find((o) => !o.verificationOk);
  if (!firstViolation || !firstViolation.violation)
    return { accepted: false, reason: "no violation observed" };
  if (
    firstViolation.violation.invariantId !== bundle.violation.invariantId ||
    firstViolation.violation.logicalActionId !== bundle.violation.logicalActionId ||
    firstViolation.index !== trace.length - 1
  )
    return {
      accepted: false,
      reason: `violation ${firstViolation.violation.invariantId} at ${firstViolation.violation.logicalActionId}, not at the original violating action`,
    };
  return { accepted: true, reason: `reproduced ${bundle.violation.invariantId} at ${bundle.violation.logicalActionId}` };
}

/** Split `items` into `n` contiguous ranges of near-equal size (first ranges one longer). */
function ranges<T>(items: T[], n: number): T[][] {
  const out: T[][] = [];
  const base = Math.floor(items.length / n);
  let extra = items.length % n;
  let i = 0;
  for (let k = 0; k < n; k += 1) {
    const size = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    out.push(items.slice(i, i + size));
    i += size;
  }
  return out.filter((r) => r.length > 0);
}

/**
 * Bounded range deletion (the complement step of ddmin). The violating action is always kept.
 * Start by trying to remove all earlier actions at once, then halves, quarters and so on down to
 * single actions. After a removal is accepted, the range count drops by one and the scan restarts.
 * Stops when no single remaining action can be removed, when only the violating action is left,
 * or at the replay cap or the timeout, whichever comes first.
 */
export function reduceTrace(bundle: EvidenceBundle, options: ReductionOptions): ReductionResult {
  const bounds = options.bounds ?? RB017_DEFAULT_BOUNDS;
  const now = options.now ?? (() => globalThis.performance.now());
  const started = now();
  const attempts: ReductionAttempt[] = [];
  const original = bundle.trace;
  let replaysUsed = 0;

  const finish = (stopReason: ReductionStopReason, kept: TraceAction[]): ReductionResult => ({
    status: kept.length < original.length ? "reduced" : "not_reduced",
    stopReason,
    originalLength: original.length,
    reducedLength: kept.length,
    replaysUsed,
    bounds,
    reducedTrace: kept,
    attempts,
  });
  const outOfBudget = (): ReductionStopReason | null => {
    if (replaysUsed >= bounds.maxReplays) return "replay_cap";
    if (now() - started > bounds.maxWallMs) return "timeout";
    return null;
  };

  // Baseline: the original trace must itself pass, with per-step hashes matching the recorded run.
  const stopBeforeBaseline = outOfBudget();
  if (stopBeforeBaseline) return finish(stopBeforeBaseline, original);
  replaysUsed += 1;
  const baseline = checkCandidate(bundle, original, { ...options, requireHashMatch: true });
  attempts.push({ replay: replaysUsed, removedSequences: [], candidateLength: original.length, ...baseline });
  if (!baseline.accepted) return finish("baseline_rejected", original);

  const violating = original[original.length - 1]!;
  let prefix = original.slice(0, -1);
  let n = 1;
  for (;;) {
    if (prefix.length === 0) return finish("only_violating_action_left", [violating]);
    n = Math.min(n, prefix.length);
    let removedOne = false;
    for (const range of ranges(prefix, n)) {
      const stop = outOfBudget();
      if (stop) return finish(stop, [...prefix, violating]);
      const drop = new Set(range);
      const candidatePrefix = prefix.filter((a) => !drop.has(a));
      const candidate = [...candidatePrefix, violating];
      replaysUsed += 1;
      const verdict = checkCandidate(bundle, candidate, options);
      attempts.push({
        replay: replaysUsed,
        removedSequences: range.map((a) => a.sequence),
        candidateLength: candidate.length,
        ...verdict,
      });
      if (verdict.accepted) {
        prefix = candidatePrefix;
        n = Math.max(n - 1, 1);
        removedOne = true;
        break;
      }
    }
    if (removedOne) continue;
    if (n >= prefix.length) return finish("no_single_action_removable", [...prefix, violating]);
    n = Math.min(n * 2, prefix.length);
  }
}
