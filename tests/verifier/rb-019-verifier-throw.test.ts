import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// RB-019 (Titan, item 2): a verifier throw must never count as a clean result.
// The verifier is wrapped so a test can make verifyTransition throw on demand; every other
// export is the real one. The throw stands in for any verifier failure, including the
// fail-closed parse of a structurally invalid snapshot.
const control = vi.hoisted(() => ({ throwFromCall: 0, calls: 0 }));

vi.mock("@rulebreak/verifier", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@rulebreak/verifier")>();
  return {
    ...actual,
    verifyTransition: (...args: Parameters<typeof actual.verifyTransition>) => {
      control.calls += 1;
      if (control.throwFromCall > 0 && control.calls >= control.throwFromCall) {
        throw new Error("rb-019 injected verifier throw");
      }
      return actual.verifyTransition(...args);
    },
  };
});

const { ScriptedCampaignRunner, buildDefaultOfflinePlan, buildRb018RewardPlan, knownTradeFailureSteps, runComparison } = await import("@rulebreak/campaign");
const { loadBundleFromStore, replayBundle } = await import("@rulebreak/replay");

function throwFrom(call: number): void {
  control.calls = 0;
  control.throwFromCall = call;
}

afterEach(() => throwFrom(0));

const tempDb = () => join(mkdtempSync(join(tmpdir(), "rb019-throw-")), "campaign.sqlite");

describe("RB-019 a verifier throw never ends as no_violation_observed", () => {
  it("benchmark runner (trade pair): every executed run ends as error", () => {
    throwFrom(1);
    const { report } = runComparison(buildDefaultOfflinePlan({ comparisonId: "rb019-throw-trade" }));
    const executed = report.runs.filter((r) => r.outcome !== "not_run");
    expect(executed.length).toBeGreaterThan(0);
    expect(new Set(executed.map((r) => r.outcome))).toEqual(new Set(["error"]));
    expect(executed.every((r) => r.stopReason === "error")).toBe(true);
  });

  it("benchmark runner (RB-018 reward pair, seeded_random and scripted_known execute): every executed run ends as error", () => {
    throwFrom(1);
    const { report } = runComparison(buildRb018RewardPlan());
    const executed = report.runs.filter((r) => r.outcome !== "not_run");
    expect(executed.length).toBeGreaterThan(0);
    expect(new Set(executed.map((r) => r.outcome))).toEqual(new Set(["error"]));
  });

  it("benchmark runner: a throw part-way through a run still ends as error", () => {
    throwFrom(3);
    const { report } = runComparison(buildDefaultOfflinePlan({ comparisonId: "rb019-throw-late" }));
    const first = report.runs.find((r) => r.outcome !== "not_run")!;
    expect(first.outcome).toBe("error");
  });

  it("scripted runner: the throw propagates and no clean outcome is recorded", () => {
    throwFrom(1);
    const runner = new ScriptedCampaignRunner({ campaignId: "camp-rb019-throw", dbPath: tempDb(), fixtureMode: "fixed", steps: knownTradeFailureSteps() });
    expect(() => runner.run()).toThrow("rb-019 injected verifier throw");
    expect(runner.store.getCampaign("camp-rb019-throw")?.status).not.toBe("completed");
  });

  it("replay: the throw propagates instead of returning a replay result", () => {
    const runner = new ScriptedCampaignRunner({ campaignId: "camp-rb019-replay", dbPath: tempDb(), fixtureMode: "faulty", steps: knownTradeFailureSteps() });
    expect(runner.run().outcome).toBe("violation_candidate");
    const bundle = loadBundleFromStore(runner.store, "camp-rb019-replay");
    throwFrom(1);
    expect(() => replayBundle(bundle, { fixtureMode: "fixed" })).toThrow("rb-019 injected verifier throw");
    expect(() => replayBundle(bundle, { fixtureMode: "faulty", requireHashMatch: true })).toThrow("rb-019 injected verifier throw");
  });
});
