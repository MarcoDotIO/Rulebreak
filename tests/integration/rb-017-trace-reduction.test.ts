import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  RB017_CONTROL_RUN_ID,
  RB018_RESULT_CAVEAT,
  ScriptedCampaignRunner,
  buildRb017Reduction,
  runComparison,
  type Rb017Artifact,
  type ScriptedStep,
} from "@rulebreak/campaign";
import { APPROVED_RULE_PACK_REWARD_V1, ComparisonPlanSchema } from "@rulebreak/contracts";
import { knownRewardDoubleClaimSteps } from "@rulebreak/economy";
import { EvidenceStore } from "@rulebreak/evidence";
import {
  RB017_DEFAULT_BOUNDS,
  checkCandidate,
  loadBundleFromStore,
  reduceTrace,
  replayBundle,
  type EvidenceBundle,
} from "@rulebreak/replay";

const REWARD = { targetFamily: "reward" as const, rulePack: APPROVED_RULE_PACK_REWARD_V1 };
const read = (p: string) => readFileSync(resolve(p), "utf8");
const REPORT_TEXT = read("docs/spikes/rb-018-reward-report.json");
const TRACES_TEXT = read("docs/spikes/rb-018-reward-report.traces.json");
const ARTIFACT_TEXT = read("docs/spikes/rb-017-reduced-traces.json");
const ARTIFACT = JSON.parse(ARTIFACT_TEXT) as Rb017Artifact;

function bundleFor(steps: ScriptedStep[], id: string): EvidenceBundle {
  const store = new EvidenceStore(":memory:");
  const run = new ScriptedCampaignRunner(
    { campaignId: id, dbPath: ":memory:", fixtureMode: "faulty", steps, targetFamily: "reward" },
    store,
  ).run();
  expect(run.outcome).toBe("violation_candidate");
  return loadBundleFromStore(store, id);
}

/** The 4-action RB-016 script: A claims (k1), A reuses k1 (refused), B claims, A claims again with k2 (INV-006). */
const scripted = () => bundleFor(knownRewardDoubleClaimSteps(), "rb017-scripted");
const ids = (b: EvidenceBundle, keep: number[]) => b.trace.filter((a) => keep.includes(a.sequence));

describe("RB-017 acceptance: only the same violation on the same action counts", () => {
  it("accepts the original trace and a reduced one that reproduces INV-006 on the original violating action", () => {
    const b = scripted();
    expect(checkCandidate(b, b.trace, { ...REWARD, requireHashMatch: true }).accepted).toBe(true);
    const v = checkCandidate(b, ids(b, [1, 4]), REWARD);
    expect(v).toEqual({ accepted: true, reason: "reproduced INV-006 at action-4" });
  });

  it("rejects a candidate where the violation no longer reproduces", () => {
    const b = scripted();
    const v = checkCandidate(b, ids(b, [3, 4]), REWARD);
    expect(v.accepted).toBe(false);
    expect(v.reason).toMatch(/expected violation was not reproduced/);
  });

  it("rejects a candidate that does not end on the original violating action", () => {
    const b = scripted();
    expect(checkCandidate(b, ids(b, [1, 2, 3]), REWARD)).toEqual({
      accepted: false,
      reason: "the violating action is not the last action",
    });
  });

  it("rejects when the reproduced violation is a different invariant", () => {
    const b = scripted();
    const other = { ...b, violation: { ...b.violation, invariantId: "INV-003" as const } };
    expect(checkCandidate(other, b.trace, REWARD).accepted).toBe(false);
  });
});

describe("RB-017 acceptance: a failed precondition or a missing setup object is rejected", () => {
  it("rejects a changed precondition even when replayBundle alone reports matched_violation", () => {
    const b = scripted();
    // Drop action 1: action 2 (reused key, refused in the original) is now granted.
    const candidate = ids(b, [2, 4]);
    expect(replayBundle({ ...b, trace: candidate }, { fixtureMode: "faulty", ...REWARD }).outcome).toBe("matched_violation");
    const v = checkCandidate(b, candidate, REWARD);
    expect(v.accepted).toBe(false);
    expect(v.reason).toBe(
      "precondition changed at action-2: recorded domain_rejected DUPLICATE_IDEMPOTENCY_KEY, replayed accepted REWARD_GRANTED",
    );
  });

  it("rejects a candidate that keeps an action whose setup object was removed", () => {
    const b = bundleFor(
      [
        { actorId: "player-a", kind: "trade_create", params: { itemId: "relic-001", counterpartyId: "player-b", price: 5 } },
        { actorId: "player-b", kind: "trade_accept", params: { tradeId: "trade-0001" } },
        { actorId: "player-a", kind: "reward_claim", params: { rewardId: "launch-bonus-001", idempotencyKey: "k1" } },
        { actorId: "player-a", kind: "reward_claim", params: { rewardId: "launch-bonus-001", idempotencyKey: "k2" } },
      ],
      "rb017-trade-setup",
    );
    const v = checkCandidate(b, ids(b, [2, 3, 4]), REWARD);
    expect(v.accepted).toBe(false);
    expect(v.reason).toMatch(/^precondition changed at action-2: recorded accepted TRADE_ACCEPTED, replayed domain_rejected/);
    // The reducer still reduces by removing the trade and its setup together.
    const r = reduceTrace(b, REWARD);
    expect(r.reducedTrace.map((a) => a.sequence)).toEqual([3, 4]);
    expect([r.status, r.stopReason]).toEqual(["reduced", "no_single_action_removable"]);
  });
});

describe("RB-017 acceptance: the start state and replay errors", () => {
  it("rejects a tampered start state as baseline_rejected; replayBundle stays lenient unless requireStartHashMatch is set", () => {
    const b = scripted();
    const tampered: EvidenceBundle = {
      ...b,
      initialState: { ...b.initialState, rewardPoints: { "player-a": 5, "player-b": 0 } },
    };
    // Default (false): existing callers see no change.
    expect(replayBundle(tampered, { fixtureMode: "faulty", ...REWARD }).outcome).toBe("matched_violation");
    expect(replayBundle(tampered, { fixtureMode: "faulty", ...REWARD, requireStartHashMatch: true }).outcome).toBe("error");
    const r = reduceTrace(tampered, REWARD);
    expect([r.status, r.stopReason, r.replaysUsed, r.reducedTrace]).toEqual(["not_reduced", "baseline_rejected", 1, tampered.trace]);
    expect(r.attempts[0]!.reason).toBe("replay error: start state hash does not match the bundle's initial state");
  });

  it("counts a replay that throws as a rejected candidate, and the attempt still counts against the cap", () => {
    const b = scripted();
    const broken: EvidenceBundle = {
      ...b,
      trace: b.trace.map((a, i) =>
        i === 1 ? { ...a, envelope: { ...a.envelope, kind: "bogus" as unknown as typeof a.envelope.kind } } : a,
      ),
    };
    const v = checkCandidate(broken, broken.trace, REWARD);
    expect(v.accepted).toBe(false);
    expect(v.reason).toMatch(/^replay threw: /);
    const r = reduceTrace(broken, REWARD);
    expect([r.status, r.stopReason, r.replaysUsed, r.attempts.length]).toEqual(["not_reduced", "baseline_rejected", 1, 1]);
    expect(r.attempts[0]!.reason).toMatch(/^replay threw: /);
  });
});

describe("RB-017 bounds", () => {
  it("stops at the replay cap, counting the baseline replay", () => {
    const b = bundleFor(
      [
        ...Array.from({ length: 6 }, (_, i) => ({
          actorId: "player-b" as const,
          kind: "reward_claim" as const,
          params: { rewardId: "reward-unknown", idempotencyKey: `u${i}` },
        })),
        ...knownRewardDoubleClaimSteps(),
      ],
      "rb017-cap",
    );
    const r = reduceTrace(b, { ...REWARD, bounds: { maxReplays: 3, maxWallMs: 60_000 } });
    expect([r.stopReason, r.replaysUsed, r.attempts.length]).toEqual(["replay_cap", 3, 3]);
    const none = reduceTrace(b, { ...REWARD, bounds: { maxReplays: 0, maxWallMs: 60_000 } });
    expect([none.status, none.stopReason, none.replaysUsed, none.reducedTrace]).toEqual(["not_reduced", "replay_cap", 0, b.trace]);
  });

  it("stops at the wall-clock timeout (injected clock)", () => {
    const b = scripted();
    let t = 0;
    const r = reduceTrace(b, { ...REWARD, bounds: { maxReplays: 100, maxWallMs: 2_500 }, now: () => (t += 1_000) });
    expect(r.stopReason).toBe("timeout");
    expect(r.replaysUsed).toBeLessThan(3);
  });

  it("defaults to 100 replays and a 10 second timeout per trace", () => {
    expect(RB017_DEFAULT_BOUNDS).toEqual({ maxReplays: 100, maxWallMs: 10_000 });
    expect(ARTIFACT.bounds).toEqual(RB017_DEFAULT_BOUNDS);
    for (const t of ARTIFACT.traces) expect(t.replaysUsed).toBeLessThanOrEqual(100);
  });

  it("does not modify the input bundle, and keeps the violating action", () => {
    const b = scripted();
    const before = JSON.stringify(b);
    const r = reduceTrace(b, REWARD);
    expect(JSON.stringify(b)).toBe(before);
    expect(r.reducedTrace.at(-1)?.envelope.logicalActionId).toBe(b.violation.logicalActionId);
    for (const a of r.reducedTrace) expect(b.trace).toContain(a);
  });
});

describe("RB-017 committed artifact", () => {
  it("records the sha256 of the committed RB-018 report and traces it was built from", () => {
    const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
    expect(ARTIFACT.source.reportSha256).toBe(sha(REPORT_TEXT));
    expect(ARTIFACT.source.tracesSha256).toBe(sha(TRACES_TEXT));
  });

  it("keeps each original trace byte-for-byte as committed in the RB-018 snapshot", () => {
    const committed = JSON.parse(TRACES_TEXT) as { runId: string; calls: string[] }[];
    for (const t of ARTIFACT.traces) {
      const source = committed.find((c) => c.runId === t.runId)!;
      expect(Buffer.from(JSON.stringify(t.original.calls), "utf8").equals(Buffer.from(JSON.stringify(source.calls), "utf8"))).toBe(true);
      // Each call's exact JSON-encoded bytes occur in the committed traces file.
      for (const c of t.original.calls) expect(TRACES_TEXT.includes(JSON.stringify(c))).toBe(true);
      expect(t.original.calls).toHaveLength(t.originalCountedActions);
      expect(t.original.replayableActions).toHaveLength(t.originalReplayableActions);
    }
  });

  it("is deterministic: a fresh build equals the committed file byte-for-byte", () => {
    const a = `${JSON.stringify(buildRb017Reduction(REPORT_TEXT, TRACES_TEXT), null, 2)}\n`;
    const b = `${JSON.stringify(buildRb017Reduction(REPORT_TEXT, TRACES_TEXT), null, 2)}\n`;
    expect(a).toBe(b);
    expect(Buffer.from(a).equals(Buffer.from(ARTIFACT_TEXT))).toBe(true);
  });

  it("covers the 5 confirmed seeded_random faulty traces plus one labelled scripted_known control", () => {
    expect(ARTIFACT.traces.filter((t) => t.role === "input").map((t) => [t.runId, t.originalCountedActions])).toEqual([
      ["seeded_random--faulty--rb018-seed-01", 37],
      ["seeded_random--faulty--rb018-seed-02", 108],
      ["seeded_random--faulty--rb018-seed-03", 32],
      ["seeded_random--faulty--rb018-seed-04", 18],
      ["seeded_random--faulty--rb018-seed-05", 35],
    ]);
    const control = ARTIFACT.traces.filter((t) => t.role === "control");
    expect(control.map((t) => [t.runId, t.originalCountedActions])).toEqual([[RB017_CONTROL_RUN_ID, 4]]);
    expect(control[0]!.label).toMatch(/by construction; not an input/);
  });

  it("each committed reduced trace passes the acceptance check again against a freshly loaded bundle", () => {
    const plan = ComparisonPlanSchema.parse(JSON.parse(REPORT_TEXT).plan);
    const { store } = runComparison(plan);
    for (const t of ARTIFACT.traces) {
      const bundle = loadBundleFromStore(store, `${plan.comparisonId}--${t.runId}`);
      expect(JSON.stringify(bundle.trace)).toBe(JSON.stringify(t.original.replayableActions));
      expect(checkCandidate(bundle, t.reduced.actions, REWARD)).toEqual({
        accepted: true,
        reason: `reproduced INV-006 at ${bundle.violation.logicalActionId}`,
      });
    }
  });

  it("every reduced trace is a subsequence of its original and ends on the original violating action", () => {
    for (const t of ARTIFACT.traces) {
      const orig = t.original.replayableActions;
      let j = 0;
      for (const a of t.reduced.actions) {
        while (j < orig.length && JSON.stringify(orig[j]) !== JSON.stringify(a)) j += 1;
        expect(j).toBeLessThan(orig.length);
        j += 1;
      }
      expect(t.reduced.actions.at(-1)?.envelope.logicalActionId).toBe(orig.at(-1)?.envelope.logicalActionId);
      expect(t.reduced.calls).toHaveLength(t.reducedLength);
      expect(t.reducedLength).toBeLessThanOrEqual(t.originalReplayableActions);
    }
  });

  it("result lines say reduced, carry the caveat, and never call the result minimal", () => {
    for (const t of ARTIFACT.traces) {
      expect(t.line).toContain(`Caveat: ${RB018_RESULT_CAVEAT}.`);
      expect(t.line).toContain(
        "the shortest reduction found here: the reducer stops once no single remaining action can be removed, so 2 is not a property of the defect",
      );
      expect(t.line.replace(/not claimed to be minimal/g, "")).not.toMatch(/minimal/i);
      expect(t.line.replace(`Caveat: ${RB018_RESULT_CAVEAT}.`, "")).not.toMatch(/average|median|rate\b/i);
    }
    expect(ARTIFACT_TEXT.replace(/not claimed to be minimal/g, "")).not.toMatch(/minimal/i);
  });
});
