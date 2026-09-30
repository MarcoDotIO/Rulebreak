import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  DEFAULT_RB018_SEEDS,
  RB015_SEEDED_RANDOM_GENERATOR_ID,
  RB018_COMPARABLE_NOTE,
  RB018_COMPARISON_ID,
  RB018_LLM_NOT_RUN_REASON,
  RB018_SEEDED_RANDOM_REWARD_GENERATOR_ID,
  RB018_UNKNOWN_REWARD_ID,
  REWARD_NO_TOOL_NOT_RUN_REASON,
  buildDefaultOfflinePlan,
  buildRb018RewardPlan,
  buildRewardOfflinePlan,
  RB018_RESULT_CAVEAT,
  rb018ScriptedRepeatsLabel,
  rb018SeedCountText,
  runComparison,
} from "@rulebreak/campaign";
import {
  ComparisonReportV2Schema,
  RewardClaimParamsSchema,
  assertNoAuthorityFields,
  comparableSettingsKey,
  validateComparisonV2,
  type ComparisonPlan,
  type ComparisonReportV2,
} from "@rulebreak/contracts";
import { REWARD_CATALOG_V1 } from "@rulebreak/economy";
import { loadBundleFromStore, replayBundle } from "@rulebreak/replay";

function withoutWall(report: ComparisonReportV2) {
  return { ...report, runs: report.runs.map(({ wallSeconds: _w, ...rest }) => rest) };
}
const campaignOf = (r: ComparisonReportV2, runId: string) => `${r.plan.comparisonId}--${runId}`;
const committed = (name: string) => JSON.parse(readFileSync(resolve("docs/spikes", name), "utf8")) as ComparisonReportV2;

describe("RB-018 reward pair: seeded_random with reward_claim", () => {
  const plan = buildRb018RewardPlan();
  const { report, traces, store } = runComparison(plan);
  const runs = (arm: string, mode?: string) =>
    report.runs.filter((r) => r.arm === arm && (!mode || r.target.fixtureMode === mode));
  const callsOf = (runId: string) => traces.find((t) => t.runId === runId)?.calls ?? [];

  it("is a clean v2 comparison over 4 arms x 2 targets x 5 plan-wide seeds", () => {
    expect(validateComparisonV2(report)).toEqual({ issues: [], warnings: [] });
    expect(plan.comparisonId).toBe(RB018_COMPARISON_ID);
    expect(plan.explorerSeeds).toEqual(DEFAULT_RB018_SEEDS);
    expect(plan.explorerSeeds).toHaveLength(5);
    expect(report.runs.map((r) => r.runId)).toEqual(plan.plannedRuns.map((p) => p.runId));
    expect(report.runs).toHaveLength(4 * 2 * 5);
    expect(plan.arms.find((a) => a.arm === "seeded_random")).toEqual({
      arm: "seeded_random",
      generatorId: RB018_SEEDED_RANDOM_REWARD_GENERATOR_ID,
    });
  });

  it("shares the RB-016 reward settings key (settings exclude comparisonId, arms and generatorId)", () => {
    expect(comparableSettingsKey(plan.settings)).toBe(comparableSettingsKey(buildRewardOfflinePlan().settings));
    expect(comparableSettingsKey(plan.settings)).not.toBe(comparableSettingsKey(buildDefaultOfflinePlan().settings));
    for (const r of report.runs) expect(r.settingsKey).toBe(comparableSettingsKey(plan.settings));
  });

  it("seeded_random executes on faulty and fixed and dispatches reward_claim", () => {
    for (const r of runs("seeded_random")) {
      expect(r.outcome).not.toBe("not_run");
      expect(r.outcome).not.toBe("error");
      expect(r.provenance).toBe("recorded");
      expect(r.toolsUsed).toContain("reward_claim");
      expect(callsOf(r.runId).some((c) => c.includes(":reward_claim:"))).toBe(true);
    }
  });

  it("generator args: rewardId from the target catalog plus one unknown id, no actor field, bound actors only", () => {
    const catalog = [...REWARD_CATALOG_V1.map((r) => r.rewardId), RB018_UNKNOWN_REWARD_ID];
    const seen = { rewardIds: new Set<string>(), sameKey: false, crossKey: false };
    for (const r of runs("seeded_random"))
      for (const c of callsOf(r.runId).filter((x) => x.includes(":reward_claim:"))) {
        const [actor, , ...rest] = c.split(":");
        const args = JSON.parse(rest.join(":")) as Record<string, string>;
        expect(Object.keys(args).sort()).toEqual(["idempotencyKey", "rewardId"]);
        expect(["player-a", "player-b"]).toContain(actor);
        expect(catalog).toContain(args.rewardId);
        seen.rewardIds.add(args.rewardId!);
        if (args.idempotencyKey!.startsWith(`${actor}-`)) seen.sameKey = true;
        else seen.crossKey = true;
      }
    expect([...seen.rewardIds].sort()).toEqual([...catalog].sort());
    expect([seen.sameKey, seen.crossKey]).toEqual([true, true]);
  });

  it("an actor field in reward_claim args is rejected at the boundary (authority field, then strict schema)", () => {
    const withActor = { rewardId: "launch-bonus-001", idempotencyKey: "k", actorId: "player-b" };
    expect(assertNoAuthorityFields(withActor).ok).toBe(false);
    expect(RewardClaimParamsSchema.safeParse(withActor).success).toBe(false);
    expect(RewardClaimParamsSchema.safeParse({ rewardId: "launch-bonus-001", idempotencyKey: "k" }).success).toBe(true);
  });

  it("seeded_random confirmations on faulty come from replaying the stored trace", () => {
    const confirmed = runs("seeded_random", "faulty").filter((r) =>
      r.findings.some((f) => f.invariantId === "INV-006" && f.status === "confirmed"),
    );
    for (const r of confirmed) {
      const replay = replayBundle(loadBundleFromStore(store, campaignOf(report, r.runId)), {
        fixtureMode: "faulty",
        requireHashMatch: true,
        targetFamily: "reward",
      });
      expect([replay.outcome, replay.targetId]).toEqual(["matched_violation", "synthetic-reward-faulty"]);
    }
    // Recorded result, whatever it is: pinned so a change is visible in review.
    expect(confirmed.map((r) => r.explorerSeed)).toEqual(DEFAULT_RB018_SEEDS);
  });

  it("fixed gives no confirmed finding for any executed arm (by how the fixture is built)", () => {
    for (const arm of ["scripted_known", "seeded_random"])
      for (const r of runs(arm, "fixed")) expect(r.findings.filter((f) => f.status === "confirmed")).toEqual([]);
  });

  it("scripted_known runs at the same seeds as repeats of one script with identical traces", () => {
    const faulty = runs("scripted_known", "faulty");
    expect(faulty).toHaveLength(5);
    const first = callsOf(faulty[0]!.runId);
    for (const r of faulty) {
      expect(callsOf(r.runId)).toEqual(first);
      expect(r.findings).toEqual([expect.objectContaining({ status: "confirmed", invariantId: "INV-006", firstActionIndex: 3 })]);
    }
    expect(rb018ScriptedRepeatsLabel(5)).toBe("5 repeats of one deterministic script, not 5 independent samples");
    expect(plan.heldBackVariations).toContain(rb018ScriptedRepeatsLabel(5));
  });

  it("the LLM arms stay not_run with no metrics and no campaign link", () => {
    for (const arm of ["llm_single", "llm_dual"])
      for (const r of runs(arm)) {
        expect([r.outcome, r.notRunReason]).toEqual(["not_run", RB018_LLM_NOT_RUN_REASON]);
        expect([r.actionsTaken, r.toolsUsed, r.findings, r.finalStateHash]).toEqual([0, [], [], undefined]);
        expect(store.getBenchmarkRunCampaignId(plan.comparisonId, r.runId)).toBeNull();
      }
  });

  it("records the comparable scope note in the plan", () => {
    expect(plan.heldBackVariations).toContain(RB018_COMPARABLE_NOTE);
    expect(RB018_COMPARABLE_NOTE).toMatch(/within rb-018-reward-offline-v1 only/);
  });

  it("is deterministic apart from wallSeconds", () => {
    const again = runComparison(buildRb018RewardPlan());
    expect(withoutWall(again.report)).toEqual(withoutWall(report));
    expect(again.traces).toEqual(traces);
  });
});

describe("RB-018 result wording", () => {
  it("rb018SeedCountText never yields a literal 'k of k' and spells out the all and none cases", () => {
    expect(rb018SeedCountText(5, 5)).toBe("INV-006 confirmed on all 5 independent seeds");
    expect(rb018SeedCountText(0, 5)).toBe("no finding on any of the 5 seeds");
    expect(rb018SeedCountText(3, 5)).toBe("INV-006 confirmed on 3 of the 5 independent seeds");
    for (let n = 1; n <= 30; n += 1)
      for (let k = 0; k <= n; k += 1) {
        const text = rb018SeedCountText(k, n);
        expect(text).not.toMatch(/\b(\d+) of \1\b/);
        expect(text).not.toMatch(/\d+ of \d+/);
      }
  });

  it("the plan text carries the caveat and no count-of-count wording", () => {
    const text = buildRb018RewardPlan().heldBackVariations;
    expect(text).toContain(RB018_RESULT_CAVEAT);
    expect(text).not.toMatch(/\d+ of \d+/);
    expect(buildRb018RewardPlan({ explorerSeeds: ["x1", "x2"] }).heldBackVariations).not.toContain("untuned default seeds");
  });
});

describe("RB-018 not_run is keyed on generatorId", () => {
  it("the RB-016 plan's trade generator on the reward pair stays not_run with the RB-016 reason", () => {
    const { report } = runComparison(buildRewardOfflinePlan());
    const sr = report.runs.filter((r) => r.arm === "seeded_random");
    expect(sr.length).toBeGreaterThan(0);
    for (const r of sr) expect([r.outcome, r.notRunReason]).toEqual(["not_run", REWARD_NO_TOOL_NOT_RUN_REASON]);
  });

  it("the reward generator on the trade pair is refused as an unknown generator (error, no actions)", () => {
    const base = buildDefaultOfflinePlan({ explorerSeeds: ["s1"] });
    const p: ComparisonPlan = {
      ...base,
      arms: base.arms.map((a) =>
        a.arm === "seeded_random" ? { arm: "seeded_random", generatorId: RB018_SEEDED_RANDOM_REWARD_GENERATOR_ID } : a,
      ),
    };
    const r = runComparison(p).report.runs.filter((x) => x.arm === "seeded_random");
    for (const run of r) {
      expect([run.outcome, run.actionsTaken, run.toolsUsed]).toEqual(["error", 0, []]);
      expect(run.errorMessage).toMatch(/unknown generatorId rb018-seeded-random-reward-v1/);
    }
  });

  it("the trade pair's seeded_random never dispatches reward_claim", () => {
    const { report, traces } = runComparison(buildDefaultOfflinePlan());
    for (const r of report.runs) expect(r.toolsUsed).not.toContain("reward_claim");
    for (const t of traces) expect(t.calls.some((c) => c.includes(":reward_claim:"))).toBe(false);
    expect(buildDefaultOfflinePlan().arms.find((a) => a.arm === "seeded_random")).toEqual({
      arm: "seeded_random",
      generatorId: RB015_SEEDED_RANDOM_GENERATOR_ID,
    });
  });
});

describe("RB-018 security-policy gate before dispatch", () => {
  it("a gate refusal (execution live) ends the run as error: no action, not in toolsUsed, named in errorMessage", () => {
    const plan = buildRb018RewardPlan({ explorerSeeds: ["s1"] });
    const { report, traces } = runComparison(plan, { hooks: { gateExecution: "live" } });
    for (const arm of ["scripted_known", "seeded_random"]) {
      for (const r of report.runs.filter((x) => x.arm === arm)) {
        expect([r.outcome, r.stopReason]).toEqual(["error", "error"]);
        expect(r.toolsUsed).not.toContain("reward_claim");
        expect(r.errorMessage).toMatch(/reward_claim refused before dispatch: security-policy gate \(live, reward pair/);
        expect(traces.find((t) => t.runId === r.runId)?.calls.some((c) => c.includes(":reward_claim:"))).toBe(false);
      }
    }
    // scripted_known's first step is reward_claim, so nothing was dispatched.
    for (const r of report.runs.filter((x) => x.arm === "scripted_known")) expect(r.actionsTaken).toBe(0);
  });

  it("the default gate execution (offline_fixture) leaves every trade run unchanged", () => {
    const plan = buildDefaultOfflinePlan({ explorerSeeds: ["s1"] });
    const a = runComparison(plan).report;
    const b = runComparison(plan, { hooks: { gateExecution: "live" } }).report;
    // P0 tools are allowed in every context, so the trade pair is unaffected even with execution live.
    expect(withoutWall(b)).toEqual(withoutWall(a));
  });
});

describe("RB-018 leaves the published RB-016 and RB-015 v2 snapshots unchanged", () => {
  it("bench:rb016's report equals docs/spikes/rb-016-reward-report.json apart from wallSeconds", () => {
    const { report } = runComparison(buildRewardOfflinePlan());
    expect(withoutWall(report)).toEqual(withoutWall(committed("rb-016-reward-report.json")));
  });

  it("bench:rb015's report equals docs/spikes/rb-015-v2-offline-report.json apart from wallSeconds", () => {
    const { report } = runComparison(buildDefaultOfflinePlan());
    expect(withoutWall(report)).toEqual(withoutWall(committed("rb-015-v2-offline-report.json")));
  });
});

describe("RB-018 committed snapshot", () => {
  it("docs/spikes/rb-018-reward-report.json equals a fresh run apart from wallSeconds and validates clean", () => {
    const snap = committed("rb-018-reward-report.json");
    expect(validateComparisonV2(ComparisonReportV2Schema.parse(snap))).toEqual({ issues: [], warnings: [] });
    expect(withoutWall(runComparison(buildRb018RewardPlan()).report)).toEqual(withoutWall(snap));
    expect(readFileSync(resolve("docs/spikes/rb-018-reward-report.summary.json"), "utf8")).not.toMatch(/5 of 5/);
  });
});

describe("bench:rb018 end to end", () => {
  it("run -> store -> export -> validate; k of n seeds wording; scripted repeats label; LLM not_run", () => {
    const dir = mkdtempSync(join(tmpdir(), "rb018-bench-"));
    const args = [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/bench-rb015.ts"), "--rb018-reward", "--store-dir", dir];
    const env = { ...process.env, RULEBREAK_LIVE_ENABLED: "false" };
    const res = spawnSync(process.execPath, args, { encoding: "utf8", env });
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toMatch(/RB-018 reward pair/);
    expect(res.stdout).toMatch(/validateComparisonV2: clean/);
    expect(res.stdout).not.toMatch(/5 of 5/);
    const id = RB018_COMPARISON_ID;
    expect(existsSync(join(dir, `${id}.sqlite`))).toBe(true);
    const written = ComparisonReportV2Schema.parse(JSON.parse(readFileSync(join(dir, `${id}.report.json`), "utf8")));
    expect(validateComparisonV2(written).issues).toEqual([]);
    expect(written.runs).toHaveLength(4 * 2 * 5);
    const summaryText = readFileSync(join(dir, `${id}.report.summary.json`), "utf8");
    expect(summaryText).not.toMatch(/5 of 5/);
    const summary = JSON.parse(summaryText);
    expect(summary.comparableNote).toBe(RB018_COMPARABLE_NOTE);
    expect(summary.results.seeded_random).toMatchObject({ seeds: 5, faultySeedsConfirmedInv006: 5, fixedSeedsConfirmedInv006: 0 });
    const sr: string = summary.results.seeded_random.text;
    expect(sr).toContain("synthetic-reward-faulty: INV-006 confirmed on all 5 independent seeds");
    expect(sr).toContain("first violation at actions 37, 108, 32, 18, 35; median of 5 seeds, 35");
    expect(sr).toContain("synthetic-reward-fixed: no finding on any of the 5 seeds (every run used its full 200-action budget), by construction");
    expect(sr).toContain("comes from how the fixture is built, not measured");
    expect(summary.results.seeded_random.faultyFirstViolationActions).toEqual([37, 108, 32, 18, 35]);
    expect(summary.results.caveat).toBe(RB018_RESULT_CAVEAT);
    for (const line of [sr, summary.results.scripted_known.text, summary.results.llm])
      expect(line).toContain(`Caveat: ${RB018_RESULT_CAVEAT}.`);
    for (const line of res.stdout.split("\n").filter((l) => /^  (seeded_random:|scripted_known \(|llm_single and)/.test(l)))
      expect(line).toContain(`Caveat: ${RB018_RESULT_CAVEAT}.`);
    expect(summaryText).not.toMatch(/seeds out of/);
    expect(res.stdout.split("\n").filter((l) => /^  (seeded_random:|scripted_known \(|llm_single and)/.test(l))).toHaveLength(3);
    expect(summary.results.scripted_known.label).toBe(rb018ScriptedRepeatsLabel(5));
    const byArm = Object.fromEntries(summary.summary.map((s: { arm: string }) => [s.arm, s]));
    for (const arm of ["llm_single", "llm_dual"]) {
      expect(byArm[arm]).toMatchObject({ status: "not_run", executed: 0, notRun: 10 });
      expect(byArm[arm]).not.toHaveProperty("faultyConfirmed");
    }
    expect(summary.honestyCaps.join("\n")).not.toMatch(/\bsecure\b/);
  }, 60_000);
});
