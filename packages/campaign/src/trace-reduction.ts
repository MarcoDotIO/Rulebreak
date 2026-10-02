/**
 * RB-017: bounded reduction of the confirmed RB-018 seeded_random traces.
 *
 * Input is the committed RB-018 snapshot (report + traces). The comparison plan inside the committed
 * report is rerun in memory so each confirmed run's evidence bundle (initial state, dispatched
 * actions with recorded results and hashes, violation) can be loaded from the store. The rerun must
 * reproduce the committed traces exactly, and every bundle action must match its committed call
 * string, or the build fails. Each bundle is then reduced with reduceTrace (packages/replay), which
 * replays every candidate with replayBundle and the independent verifier.
 *
 * Offline, $0, deterministic. The output holds each original trace verbatim next to the reduced one.
 */
import { createHash } from "node:crypto";
import {
  APPROVED_RULE_PACK_REWARD_V1,
  ComparisonPlanSchema,
  ComparisonReportV2Schema,
} from "@rulebreak/contracts";
import {
  RB017_DEFAULT_BOUNDS,
  loadBundleFromStore,
  reduceTrace,
  type ReductionBounds,
  type ReductionResult,
  type TraceAction,
} from "@rulebreak/replay";
import { canonicalJson } from "@rulebreak/verifier";
import { RB018_RESULT_CAVEAT, runComparison, type OfflineRunTrace } from "./benchmark-runner.js";

export const RB017_REDUCTION_ID = "rb-017-reduced-traces-v1";
export const RB017_SOURCE_REPORT = "docs/spikes/rb-018-reward-report.json";
export const RB017_SOURCE_TRACES = "docs/spikes/rb-018-reward-report.traces.json";
/** The labelled control: the 4-action hand-written script. Its other four repeats are identical. */
export const RB017_CONTROL_RUN_ID = "scripted_known--faulty--rb018-seed-01";
/** Role labels used in the artifact, the summary, the CLI table and the contract. */
export const RB017_ROLE_LABELS = {
  input: "input",
  control: "control (hand-written, by construction; not an input)",
} as const;
/** Column label for the replayed count, the same in the contract, the CLI table and the PR body. */
export const RB017_REPLAYED_COLUMN = "Actions that reached the target (replayed)";

/** Why the reducer stopped, in words. */
export function rb017StopText(stopReason: ReductionResult["stopReason"], bounds: ReductionBounds): string {
  return stopReason === "no_single_action_removable"
    ? "no single remaining action could be removed"
    : stopReason === "only_violating_action_left"
      ? "only the violating action was left"
      : stopReason === "replay_cap"
        ? `the ${bounds.maxReplays}-replay cap was reached`
        : stopReason === "timeout"
          ? `the ${bounds.maxWallMs} ms timeout was reached`
          : "the original trace did not pass its baseline replay";
}

/** Reduced-length wording. When the search stopped on its own, the length is the shortest found here, not a property of the defect. */
export function rb017ReducedText(status: ReductionResult["status"], stopReason: ReductionResult["stopReason"], length: number): string {
  if (status !== "reduced") return `not reduced (${length} actions)`;
  if (stopReason === "no_single_action_removable")
    return (
      `reduced to ${length} actions, the shortest reduction found here: the reducer stops once no single remaining ` +
      `action can be removed, so ${length} is not a property of the defect (not claimed to be minimal)`
    );
  return `reduced to ${length} actions (not claimed to be minimal)`;
}

export const RB017_REDUCTION_SCOPE_NOTE =
  "Each result is a reduced trace, not claimed to be minimal: the search is bounded and only deletes ranges of actions.";

export type Rb017TraceEntry = {
  runId: string;
  role: "input" | "control";
  label: string;
  explorerSeed: string;
  /** Counted explorer actions in the committed RB-018 run (its first violation is the last one). */
  originalCountedActions: number;
  /** Counted actions that reached the target and are in the evidence bundle; the reducer works on these. */
  originalReplayableActions: number;
  /** Counted actions that never reached the target (reads, notes), by tool; dropped without a replay. */
  notDispatchedByTool: Record<string, number>;
  reducedLength: number;
  replaysUsed: number;
  status: ReductionResult["status"];
  stopReason: ReductionResult["stopReason"];
  line: string;
  original: {
    /** Verbatim from the committed RB-018 traces file. */
    calls: string[];
    /** The evidence bundle's actions, unchanged. */
    replayableActions: TraceAction[];
  };
  reduced: {
    /** The kept actions: the same objects as in original.replayableActions (same ids, actors, params). */
    actions: TraceAction[];
    /** The committed call strings for the kept actions, in order. */
    calls: string[];
  };
  attempts: ReductionResult["attempts"];
};

export type Rb017Artifact = {
  schemaVersion: 1;
  reductionId: string;
  source: {
    comparisonId: string;
    reportFile: string;
    reportSha256: string;
    tracesFile: string;
    tracesSha256: string;
  };
  replayPath: string;
  bounds: ReductionBounds;
  caveat: string;
  reductionScopeNote: string;
  traces: Rb017TraceEntry[];
};

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

function callOf(a: TraceAction): string {
  return `${a.envelope.actorId}:${a.envelope.kind}:${canonicalJson(a.envelope.params)}`;
}

/** 1-based counted-action index from the runner's logicalActionId ("action-<n>"). */
function countedIndex(a: TraceAction): number {
  const m = /^action-(\d+)$/.exec(a.envelope.logicalActionId);
  if (!m) throw new Error(`unexpected logicalActionId ${a.envelope.logicalActionId}`);
  return Number(m[1]);
}

function lineFor(e: Omit<Rb017TraceEntry, "line" | "original" | "reduced" | "attempts">, bounds: ReductionBounds): string {
  const stop = rb017StopText(e.stopReason, bounds);
  const result = rb017ReducedText(e.status, e.stopReason, e.reducedLength);
  const role = e.role === "control" ? ` [${RB017_ROLE_LABELS.control}]` : "";
  return (
    `${e.runId}${role}: original ${e.originalCountedActions} counted actions, of which ${e.originalReplayableActions} reached ` +
    `the target and were replayed; ${result}; ${e.replaysUsed} replays used (cap ${bounds.maxReplays}); stopped because ${stop}. ` +
    `Caveat: ${RB018_RESULT_CAVEAT}.`
  );
}

export type BuildRb017Options = { bounds?: ReductionBounds; now?: () => number };

/**
 * Build the RB-017 artifact from the committed RB-018 report and traces file contents.
 * Throws if the rerun does not reproduce the committed traces or a bundle action does not match
 * its committed call.
 */
export function buildRb017Reduction(reportText: string, tracesText: string, opts: BuildRb017Options = {}): Rb017Artifact {
  const bounds = opts.bounds ?? RB017_DEFAULT_BOUNDS;
  const committedReport = ComparisonReportV2Schema.parse(JSON.parse(reportText));
  const committedTraces = JSON.parse(tracesText) as OfflineRunTrace[];
  const plan = ComparisonPlanSchema.parse(committedReport.plan);
  const { report, traces, store } = runComparison(plan);

  // The rerun must reproduce the committed traces exactly.
  if (JSON.stringify(traces) !== JSON.stringify(committedTraces))
    throw new Error("rerun of the committed RB-018 plan did not reproduce the committed traces");

  const inputs = report.runs.filter(
    (r) =>
      r.arm === "seeded_random" &&
      r.target.fixtureMode === "faulty" &&
      r.findings.some((f) => f.status === "confirmed" && f.invariantId === "INV-006"),
  );
  const control = report.runs.find((r) => r.runId === RB017_CONTROL_RUN_ID);
  if (!control) throw new Error(`control run ${RB017_CONTROL_RUN_ID} not found`);

  const entries: Rb017TraceEntry[] = [];
  for (const [run, role] of [...inputs.map((r) => [r, "input"] as const), [control, "control"] as const]) {
    const committed = committedTraces.find((t) => t.runId === run.runId);
    if (!committed) throw new Error(`no committed trace for ${run.runId}`);
    const bundle = loadBundleFromStore(store, `${plan.comparisonId}--${run.runId}`);
    for (const a of bundle.trace)
      if (committed.calls[countedIndex(a) - 1] !== callOf(a))
        throw new Error(`${run.runId} ${a.envelope.logicalActionId} does not match its committed call`);
    const result = reduceTrace(bundle, {
      targetFamily: "reward",
      rulePack: APPROVED_RULE_PACK_REWARD_V1,
      bounds,
      ...(opts.now ? { now: opts.now } : {}),
    });
    const dispatched = new Set(bundle.trace.map(countedIndex));
    const notDispatchedByTool: Record<string, number> = {};
    committed.calls.forEach((c, i) => {
      if (dispatched.has(i + 1)) return;
      const tool = c.split(":")[1] ?? "unknown";
      notDispatchedByTool[tool] = (notDispatchedByTool[tool] ?? 0) + 1;
    });
    const head = {
      runId: run.runId,
      role,
      label:
        role === "control"
          ? RB017_ROLE_LABELS.control
          : "confirmed seeded_random trace on synthetic-reward-faulty",
      explorerSeed: run.explorerSeed,
      originalCountedActions: committed.calls.length,
      originalReplayableActions: bundle.trace.length,
      notDispatchedByTool: Object.fromEntries(Object.entries(notDispatchedByTool).sort(([a], [b]) => a.localeCompare(b))),
      reducedLength: result.reducedLength,
      replaysUsed: result.replaysUsed,
      status: result.status,
      stopReason: result.stopReason,
    };
    entries.push({
      ...head,
      line: lineFor(head, bounds),
      original: { calls: committed.calls, replayableActions: bundle.trace },
      reduced: { actions: result.reducedTrace, calls: result.reducedTrace.map((a) => committed.calls[countedIndex(a) - 1]!) },
      attempts: result.attempts,
    });
  }

  return {
    schemaVersion: 1,
    reductionId: RB017_REDUCTION_ID,
    source: {
      comparisonId: plan.comparisonId,
      reportFile: RB017_SOURCE_REPORT,
      reportSha256: sha256(reportText),
      tracesFile: RB017_SOURCE_TRACES,
      tracesSha256: sha256(tracesText),
    },
    replayPath:
      "replayBundle on synthetic-reward-faulty with targetFamily reward and rule pack rulebreak-reward-v1, " +
      "verified by the independent verifier (verifyTransition); every candidate replays from the bundle's initial state",
    bounds,
    caveat: RB018_RESULT_CAVEAT,
    reductionScopeNote: RB017_REDUCTION_SCOPE_NOTE,
    traces: entries,
  };
}
