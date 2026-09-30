import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  RB016_COMPARABLE_NOTE,
  REWARD_NO_TOOL_LLM_NOT_RUN_REASON,
  REWARD_NO_TOOL_NOT_RUN_REASON,
  ScriptedCampaignRunner,
  buildDefaultOfflinePlan,
  buildRewardOfflinePlan,
  knownTradeFailureSteps,
  runComparison,
  targetFamilyForSettings,
  targetIdentityProblem,
} from "@rulebreak/campaign";
import {
  APPROVED_RULE_PACK_REWARD_V1,
  ComparisonReportV2Schema,
  comparableSettingsKey,
  validateComparisonV2,
  type ComparisonReportV2,
} from "@rulebreak/contracts";
import { knownRewardDoubleClaimSteps } from "@rulebreak/economy";
import { EvidenceStore } from "@rulebreak/evidence";
import { loadBundleFromStore, replayBundle } from "@rulebreak/replay";

function withoutWall(report: ComparisonReportV2) {
  return { ...report, runs: report.runs.map(({ wallSeconds: _w, ...rest }) => rest) };
}
const campaignOf = (r: ComparisonReportV2, runId: string) => `${r.plan.comparisonId}--${runId}`;

/** The RB-015 v2 trade settings key on main before RB-016 wiring; must not change. */
const TRADE_SETTINGS_KEY_ON_MAIN =
  '{"initialStateHash":"dc95e25bb0ff75032de339e678293908","maxActions":200,"maxWallSeconds":60,' +
  '"resetProcedureId":"rb015-fresh-adapter-initialize-v1","rulePackId":"rulebreak-trade-v1","rulePackVersion":"1.0.0",' +
  '"schemaVersion":1,"spendCapUsd":0,"worldSeed":"rulebreak-v0-default",' +
  '"toolAccess":["economy_observe","strategy_note","trade_accept","trade_cancel","trade_create"]}';

describe("RB-016 reward pair in the offline runner", () => {
  const plan = buildRewardOfflinePlan();
  const { report, traces, store } = runComparison(plan);
  const runs = (arm: string, mode?: string) =>
    report.runs.filter((r) => r.arm === arm && (!mode || r.target.fixtureMode === mode));

  it("is a clean v2 comparison with every planned run recorded", () => {
    expect(validateComparisonV2(report)).toEqual({ issues: [], warnings: [] });
    expect(report.runs.map((r) => r.runId)).toEqual(plan.plannedRuns.map((p) => p.runId));
    // One seed: scripted_known repeats the same four steps whatever the seed.
    expect(plan.explorerSeeds).toEqual(["rb016-seed-01"]);
    expect(report.runs).toHaveLength(4 * 2 * 1);
  });

  it("scripted_known confirms INV-006 at action 4 on faulty, through replay", () => {
    for (const r of runs("scripted_known", "faulty")) {
      expect([r.outcome, r.stopReason, r.actionsTaken, r.toolsUsed]).toEqual([
        "confirmed_finding",
        "first_violation",
        4,
        ["reward_claim"],
      ]);
      expect(r.findings).toEqual([expect.objectContaining({ status: "confirmed", invariantId: "INV-006", firstActionIndex: 3 })]);
      const id = campaignOf(report, r.runId);
      const campaign = store.getCampaign(id);
      expect([campaign?.targetId, campaign?.rulePackId, campaign?.mode]).toEqual([
        "synthetic-reward-faulty",
        "rulebreak-reward-v1",
        "scripted",
      ]);
      const finding = store.getFinding(id);
      expect([finding?.status, finding?.targetId, finding?.rulePackVersion, finding?.violation.invariantId]).toEqual([
        "confirmed",
        "synthetic-reward-faulty",
        APPROVED_RULE_PACK_REWARD_V1.version,
        "INV-006",
      ]);
      // The confirmation really came from replaying the stored trace.
      const replay = replayBundle(loadBundleFromStore(store, id), {
        fixtureMode: "faulty",
        requireHashMatch: true,
        targetFamily: "reward",
      });
      expect([replay.outcome, replay.targetId]).toEqual(["matched_violation", "synthetic-reward-faulty"]);
    }
  });

  it("scripted_known gives no finding on fixed (no_finding/natural after all 4 claims)", () => {
    for (const r of runs("scripted_known", "fixed")) {
      expect([r.outcome, r.stopReason, r.actionsTaken, r.findings]).toEqual(["no_finding", "natural", 4, []]);
      const campaign = store.getCampaign(campaignOf(report, r.runId));
      expect([campaign?.targetId, campaign?.rulePackId]).toEqual(["synthetic-reward-fixed", "rulebreak-reward-v1"]);
      expect(store.getFinding(campaignOf(report, r.runId))).toBeNull();
    }
  });

  it("seeded_random and the LLM arms are not_run (no reward_claim tool), with no campaign link", () => {
    for (const r of runs("seeded_random")) expect([r.outcome, r.notRunReason]).toEqual(["not_run", REWARD_NO_TOOL_NOT_RUN_REASON]);
    for (const arm of ["llm_single", "llm_dual"])
      for (const r of runs(arm)) expect([r.outcome, r.notRunReason]).toEqual(["not_run", REWARD_NO_TOOL_LLM_NOT_RUN_REASON]);
    for (const r of report.runs.filter((x) => x.outcome === "not_run")) {
      expect(r.notRunReason).toMatch(/^no reward_claim tool/);
      expect([r.actionsTaken, r.toolsUsed, r.findings, r.finalStateHash]).toEqual([0, [], [], undefined]);
      expect(store.getBenchmarkRunCampaignId(plan.comparisonId, r.runId)).toBeNull();
    }
    expect(traces.filter((t) => t.calls.length > 0)).toHaveLength(2);
  });

  it("has its own settings key and comparison id, distinct from the RB-015 trade comparison", () => {
    const trade = buildDefaultOfflinePlan();
    expect(plan.comparisonId).toMatch(/^rb-016-reward-/);
    expect(plan.comparisonId).not.toBe(trade.comparisonId);
    expect(comparableSettingsKey(plan.settings)).not.toBe(comparableSettingsKey(trade.settings));
    expect(plan.settings.rulePackId).toBe("rulebreak-reward-v1");
    expect(plan.settings.initialStateHash).not.toBe(trade.settings.initialStateHash);
    expect(targetFamilyForSettings(plan.settings)).toBe("reward");
    expect(targetFamilyForSettings(trade.settings)).toBe("trade");
  });

  it("checks reward target labels against the reward family", () => {
    const [faulty] = plan.targets;
    expect(targetIdentityProblem(faulty!, "reward")).toBeNull();
    expect(targetIdentityProblem(faulty!)).toMatch(/does not match faulty fixture synthetic-trade-faulty/);
  });

  it("records the comparable scope note in the plan", () => {
    expect(report.plan.heldBackVariations).toContain(RB016_COMPARABLE_NOTE);
    expect(report.plan.heldBackVariations).toContain("the scripted run confirmed INV-006, by construction");
  });

  it("is deterministic apart from wallSeconds", () => {
    const again = runComparison(buildRewardOfflinePlan());
    expect(withoutWall(again.report)).toEqual(withoutWall(report));
    expect(again.traces).toEqual(traces);
  });
});

describe("RB-016 replay and scripted runner on the reward pair", () => {
  function faultyRewardCampaign() {
    const store = new EvidenceStore(":memory:");
    const runner = new ScriptedCampaignRunner(
      { campaignId: "rb016-scripted", dbPath: ":memory:", fixtureMode: "faulty", steps: knownRewardDoubleClaimSteps(), targetFamily: "reward" },
      store,
    );
    return { store, result: runner.run() };
  }

  it("ScriptedCampaignRunner freezes on INV-006 at sequence 4 and records the reward labels", () => {
    const { result } = faultyRewardCampaign();
    expect(result.outcome).toBe("violation_candidate");
    expect([result.campaign.targetId, result.campaign.rulePackId]).toEqual(["synthetic-reward-faulty", "rulebreak-reward-v1"]);
    expect([result.finding?.violation.invariantId, result.finding?.violation.sequence, result.finding?.targetId]).toEqual([
      "INV-006",
      4,
      "synthetic-reward-faulty",
    ]);
    expect(result.actionCount).toBe(4);
  });

  it("the reward trace passes the trade pack: INV-006 needs rulebreak-reward-v1", () => {
    const store = new EvidenceStore(":memory:");
    const runner = new ScriptedCampaignRunner(
      {
        campaignId: "rb016-trade-pack",
        dbPath: ":memory:",
        fixtureMode: "faulty",
        steps: knownRewardDoubleClaimSteps(),
        targetFamily: "reward",
        rulePack: { ...APPROVED_RULE_PACK_REWARD_V1, rulePackId: "rulebreak-trade-v1", invariantIds: ["INV-001", "INV-002", "INV-003", "INV-004", "INV-005"], entitlementPolicyId: undefined },
      },
      store,
    );
    expect(runner.run().outcome).toBe("no_violation_observed");
  });

  it("replay on the faulty reward build matches; the fixed reward control blocks the over-grant claim", () => {
    const { store } = faultyRewardCampaign();
    const bundle = loadBundleFromStore(store, "rb016-scripted");
    const faulty = replayBundle(bundle, { fixtureMode: "faulty", requireHashMatch: true, targetFamily: "reward" });
    expect([faulty.outcome, faulty.targetId]).toEqual(["matched_violation", "synthetic-reward-faulty"]);
    const fixed = replayBundle(bundle, { fixtureMode: "fixed", targetFamily: "reward" });
    expect([fixed.outcome, fixed.targetId, fixed.message]).toEqual([
      "blocked_as_expected",
      "synthetic-reward-fixed",
      "recorded violation not reproduced; over-entitlement claim refused",
    ]);
    // Without the reward family the trace replays on trade targets, which have no rewards.
    expect(replayBundle(bundle, { fixtureMode: "faulty", targetFamily: "trade" }).outcome).not.toBe("matched_violation");
  });

  it("the fixed reward control reports an error if the violating claim is missing from the trace", () => {
    const { store } = faultyRewardCampaign();
    const bundle = loadBundleFromStore(store, "rb016-scripted");
    const broken = { ...bundle, violation: { ...bundle.violation, logicalActionId: "action-missing" } };
    expect(replayBundle(broken, { fixtureMode: "fixed", targetFamily: "reward" }).outcome).toBe("error");
  });
});

describe("RB-016 leaves the RB-015 trade path unchanged", () => {
  it("the default trade settings key is byte-identical to main", () => {
    expect(comparableSettingsKey(buildDefaultOfflinePlan().settings)).toBe(TRADE_SETTINGS_KEY_ON_MAIN);
  });

  it("ScriptedCampaignRunner defaults to the trade pair, labels and rule pack", () => {
    const store = new EvidenceStore(":memory:");
    const result = new ScriptedCampaignRunner(
      { campaignId: "trade-default", dbPath: ":memory:", fixtureMode: "faulty", steps: knownTradeFailureSteps() },
      store,
    ).run();
    expect([result.outcome, result.campaign.targetId, result.campaign.rulePackId]).toEqual([
      "violation_candidate",
      "synthetic-trade-faulty",
      "rulebreak-trade-v1",
    ]);
    expect([result.finding?.violation.invariantId, result.finding?.rulePackVersion]).toEqual(["INV-003", "1.0.0"]);
    const replay = replayBundle(loadBundleFromStore(store, "trade-default"), { fixtureMode: "fixed" });
    expect([replay.outcome, replay.targetId, replay.message]).toEqual([
      "blocked_as_expected",
      "synthetic-trade-fixed",
      "recorded violation not reproduced; illegal cancel blocked",
    ]);
  });

  it("reward_claim in a trade plan's toolAccess is refused as a settings error", () => {
    const base = buildDefaultOfflinePlan({ explorerSeeds: ["s1"] });
    const p = { ...base, settings: { ...base.settings, toolAccess: [...base.settings.toolAccess, "reward_claim" as const] } };
    const r = runComparison(p).report;
    for (const run of r.runs) {
      expect(run.outcome).toBe("error");
      expect(run.errorMessage).toMatch(/reward_claim is only available on the reward target pair/);
    }
  });
});

describe("bench:rb016 end to end", () => {
  it("run -> store -> export -> validate; not_run arms have no metrics; refuses the same id", () => {
    const dir = mkdtempSync(join(tmpdir(), "rb016-bench-"));
    const args = [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/bench-rb015.ts"), "--reward-pair", "--store-dir", dir];
    const env = { ...process.env, RULEBREAK_LIVE_ENABLED: "false" };
    const res = spawnSync(process.execPath, args, { encoding: "utf8", env });
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toMatch(/RB-016 reward pair/);
    expect(res.stdout).toMatch(/validateComparisonV2: clean/);
    const id = "rb-016-reward-offline-v1";
    const dbPath = join(dir, `${id}.sqlite`);
    expect(existsSync(dbPath)).toBe(true);
    const written = ComparisonReportV2Schema.parse(JSON.parse(readFileSync(join(dir, `${id}.report.json`), "utf8")));
    expect(validateComparisonV2(written).issues).toEqual([]);
    expect(written.runs).toHaveLength(4 * 2 * 1);
    const reopened = new EvidenceStore(dbPath);
    expect(withoutWall(reopened.exportBenchmarkReport(id))).toEqual(withoutWall(written));
    reopened.close();
    const summary = JSON.parse(readFileSync(join(dir, `${id}.report.summary.json`), "utf8"));
    const byArm = Object.fromEntries(summary.summary.map((s: { arm: string }) => [s.arm, s]));
    expect(byArm.scripted_known).toMatchObject({ planned: 2, executed: 2, faultyConfirmed: 1, cleanFalseConfirmations: 0, medianActionsToFirstConfirmed: 4 });
    expect(summary.result).toBe("scripted run confirmed INV-006, by construction");
    expect(summary.comparableNote).toBe(RB016_COMPARABLE_NOTE);
    for (const arm of ["seeded_random", "llm_single", "llm_dual"]) {
      expect(byArm[arm]).toMatchObject({ status: "not_run", executed: 0, notRun: 2 });
      expect(byArm[arm]).not.toHaveProperty("faultyConfirmed");
      expect(byArm[arm]).not.toHaveProperty("cleanFalseConfirmations");
    }
    const again = spawnSync(process.execPath, args, { encoding: "utf8", env });
    expect(again.status).not.toBe(0);
    expect(again.stderr).toMatch(/already exists/);
  }, 60_000);
});
