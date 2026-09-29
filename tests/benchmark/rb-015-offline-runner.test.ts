import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  LIVE_GATE_NOT_RUN_REASON,
  SeededChooser,
  buildDefaultOfflinePlan,
  runComparison,
  targetIdentityProblem,
} from "@rulebreak/campaign";
import {
  ComparisonReportV2Schema,
  comparableSettingsKey,
  summarizeArmsV2,
  validateComparisonV2,
  type ComparisonPlan,
  type ComparisonReportV2,
} from "@rulebreak/contracts";
import { EvidenceStore } from "@rulebreak/evidence";

function withoutWall(report: ComparisonReportV2) {
  return { ...report, runs: report.runs.map(({ wallSeconds: _w, ...rest }) => rest) };
}
const issues = (r: ComparisonReportV2) => validateComparisonV2(r).issues;

function withFaultyTarget(p: ComparisonPlan, faulty: ComparisonPlan["targets"][number]): ComparisonPlan {
  return {
    ...p,
    targets: [faulty, p.targets[1]!],
    plannedRuns: p.plannedRuns.map((r) => (r.target.fixtureMode === "faulty" ? { ...r, target: faulty } : r)),
  };
}

describe("RB-015 offline runner (contract v2)", () => {
  const plan = buildDefaultOfflinePlan();
  const { report, traces, store } = runComparison(plan);

  it("same plan and seeds reproduce an identical report (excluding wallSeconds) and traces", () => {
    const again = runComparison(buildDefaultOfflinePlan());
    expect(withoutWall(again.report)).toEqual(withoutWall(report));
    expect(again.traces).toEqual(traces);
  });

  it("different explorer seeds produce different seeded_random traces", () => {
    const random = traces.filter((t) => t.runId.startsWith("seeded_random--faulty--"));
    expect(new Set(random.map((t) => JSON.stringify(t.calls))).size).toBe(random.length);
    const a = new SeededChooser("g", "s1");
    const b = new SeededChooser("g", "s1");
    expect(Array.from({ length: 16 }, () => a.int(1000))).toEqual(Array.from({ length: 16 }, () => b.int(1000)));
  });

  it("covers the full grid with exactly one v2 record per planned run, exported in plan order", () => {
    expect(report.contractVersion).toBe(2);
    expect(plan.explorerSeeds.length).toBeGreaterThanOrEqual(3);
    expect(report.runs).toHaveLength(plan.arms.length * plan.targets.length * plan.explorerSeeds.length);
    expect(report.runs.map((r) => r.runId)).toEqual(plan.plannedRuns.map((p) => p.runId));
    expect(() => ComparisonReportV2Schema.parse(report)).not.toThrow();
  });

  it("validateComparisonV2 is clean with no warnings", () => {
    expect(validateComparisonV2(report)).toEqual({ issues: [], warnings: [] });
  });

  it("stamps settingsKey, $0, provenance, sorted toolsUsed and finalStateHash on every run", () => {
    const key = comparableSettingsKey(plan.settings);
    for (const r of report.runs) {
      expect(r.settingsKey).toBe(key);
      expect(r.costUsd).toBe(0);
      expect(r.provenance).toBe(r.arm === "scripted_known" ? "scripted" : "recorded");
      expect(r.toolsUsed).toEqual([...new Set(r.toolsUsed)].sort());
      expect(r.finalStateHash).toBeTruthy();
    }
  });

  it("links each executed run to its campaign row in the evidence store", () => {
    for (const r of report.runs)
      expect(store.getBenchmarkRunCampaignId(plan.comparisonId, r.runId)).toBe(`${plan.comparisonId}--${r.runId}`);
  });

  it("campaign, finding and event rows record mode from the arm's provenance", () => {
    for (const r of report.runs) {
      const id = `${plan.comparisonId}--${r.runId}`;
      const want = r.arm === "seeded_random" ? "recorded" : "scripted";
      expect(r.provenance).toBe(want);
      expect(store.getCampaign(id)?.mode).toBe(want);
      const finding = store.getFinding(id);
      if (finding) expect(finding.mode).toBe(want);
      expect(new Set(store.listEvents(id).map((e) => e.mode))).toEqual(new Set([want]));
    }
  });

  it("scripted_known confirms INV-003 on faulty (first_violation) and ends natural/no_finding on fixed", () => {
    for (const r of report.runs.filter((r) => r.arm === "scripted_known")) {
      if (r.target.fixtureMode === "faulty") {
        expect([r.outcome, r.stopReason]).toEqual(["confirmed_finding", "first_violation"]);
        expect(r.findings).toEqual([expect.objectContaining({ status: "confirmed", invariantId: "INV-003", firstActionIndex: 2 })]);
      } else {
        expect([r.outcome, r.stopReason, r.findings]).toEqual(["no_finding", "natural", []]);
      }
    }
  });

  it("seeded_random on fixed ends budget_exhausted/max_actions at exactly maxActions", () => {
    for (const r of report.runs.filter((r) => r.arm === "seeded_random" && r.target.fixtureMode === "fixed")) {
      expect([r.outcome, r.stopReason, r.actionsTaken]).toEqual(["budget_exhausted", "max_actions", plan.settings.maxActions]);
      expect(r.findings).toEqual([]);
    }
  });

  it("fixed-target false confirmations, candidates and not_reproduced are all 0 (structural, not measured)", () => {
    for (const s of summarizeArmsV2(report)) {
      expect(s).toMatchObject({ cleanFalseConfirmations: 0, cleanCandidates: 0, cleanNotReproduced: 0, comparable: true, comparableFullBudget: true });
      expect(s.totalCostUsd).toBe(0);
    }
  });

  it("records planned LLM arms as not_run with a null campaign link", () => {
    const { report: r, store: s } = runComparison(buildDefaultOfflinePlan({ includeLlmArms: true }));
    expect(issues(r)).toEqual([]);
    const llm = r.runs.filter((x) => x.arm === "llm_single" || x.arm === "llm_dual");
    expect(llm).toHaveLength(2 * 2 * r.plan.explorerSeeds.length);
    for (const x of llm) {
      expect(x).toMatchObject({ outcome: "not_run", stopReason: "not_run", notRunReason: LIVE_GATE_NOT_RUN_REASON, actionsTaken: 0, toolsUsed: [], findings: [], costUsd: 0 });
      expect(x.finalStateHash).toBeUndefined();
      expect(s.getBenchmarkRunCampaignId(r.plan.comparisonId, x.runId)).toBeNull();
    }
    for (const sm of summarizeArmsV2(r).filter((sm) => sm.arm.startsWith("llm_")))
      expect(sm).toMatchObject({ executed: 0, comparable: false });
  });

  it("enforces maxActions for every arm", () => {
    const small = runComparison(buildDefaultOfflinePlan({ maxActions: 2 })).report;
    expect(issues(small)).toEqual([]);
    for (const r of small.runs) expect([r.outcome, r.stopReason, r.actionsTaken]).toEqual(["budget_exhausted", "max_actions", 2]);
  });

  it("a maxWallSeconds cutoff is budget_exhausted/max_wall_seconds with a wall_time_cutoff warning", () => {
    let t = 0;
    const r = runComparison(buildDefaultOfflinePlan({ maxWallSeconds: 1, explorerSeeds: ["s1"] }), { now: () => (t += 600) }).report;
    const v = validateComparisonV2(r);
    expect(v.issues).toEqual([]);
    expect(v.warnings.map((w) => w.code)).toEqual(r.runs.map(() => "wall_time_cutoff"));
    for (const run of r.runs) expect([run.outcome, run.stopReason]).toEqual(["budget_exhausted", "max_wall_seconds"]);
    for (const s of summarizeArmsV2(r)) expect(s).toMatchObject({ comparable: true, comparableFullBudget: false });
  });

  it("operator abort is aborted/operator_abort, keeps finalStateHash, and never replays", () => {
    let replays = 0;
    const r = runComparison(buildDefaultOfflinePlan({ explorerSeeds: ["s1"] }), {
      shouldAbort: (_id, n) => n >= 2,
      hooks: { beforeReplay: () => (replays += 1) },
    });
    expect(issues(r.report)).toEqual([]);
    expect(replays).toBe(0);
    for (const run of r.report.runs) {
      expect([run.outcome, run.stopReason, run.actionsTaken, run.findings]).toEqual(["aborted", "operator_abort", 2, []]);
      expect(run.finalStateHash).toBeTruthy();
      expect(r.store.getFinding(`${r.report.plan.comparisonId}--${run.runId}`)).toBeNull();
    }
  });

  it("an abort before the first action carries the reset-state hash", () => {
    const p = buildDefaultOfflinePlan({ explorerSeeds: ["s1"] });
    const r = runComparison(p, { shouldAbort: () => true }).report;
    expect(issues(r)).toEqual([]);
    for (const run of r.runs) {
      expect([run.outcome, run.stopReason, run.actionsTaken, run.toolsUsed]).toEqual(["aborted", "operator_abort", 0, []]);
      expect(run.finalStateHash).toBe(p.settings.initialStateHash);
    }
  });

  it("an operator abort closes its campaign row as stopped (never left running)", () => {
    for (const abortAt of [0, 2]) {
      const r = runComparison(buildDefaultOfflinePlan({ explorerSeeds: ["s1"] }), {
        shouldAbort: (_id, n) => n >= abortAt,
      });
      for (const run of r.report.runs) {
        const campaign = r.store.getCampaign(`${r.report.plan.comparisonId}--${run.runId}`);
        expect(run.stopReason).toBe("operator_abort");
        expect([campaign?.status, campaign?.stopRequested]).toEqual(["stopped", true]);
      }
    }
  });

  it("a loop error is error/error, skips replay, and keeps the actions it took", () => {
    let replays = 0;
    const r = runComparison(buildDefaultOfflinePlan({ explorerSeeds: ["s1"] }), {
      hooks: {
        beforeAction: (_id, i) => {
          if (i === 1) throw new Error("injected loop failure");
        },
        beforeReplay: () => (replays += 1),
      },
    });
    expect(issues(r.report)).toEqual([]);
    expect(replays).toBe(0);
    for (const run of r.report.runs) {
      expect([run.outcome, run.stopReason, run.actionsTaken, run.findings]).toEqual(["error", "error", 1, []]);
      expect(run.errorMessage).toBe("injected loop failure");
      expect(run.finalStateHash).toBeTruthy();
    }
  });

  it("a replay error keeps first_violation, ends as error, and leaves the finding candidate", () => {
    const r = runComparison(buildDefaultOfflinePlan({ explorerSeeds: ["s1"] }), {
      hooks: {
        beforeReplay: () => {
          throw new Error("injected replay failure");
        },
      },
    });
    expect(issues(r.report)).toEqual([]);
    const faulty = r.report.runs.filter((x) => x.target.fixtureMode === "faulty");
    for (const run of faulty) {
      expect([run.outcome, run.stopReason]).toEqual(["error", "first_violation"]);
      expect(run.errorMessage).toBe("injected replay failure");
      expect(run.findings).toEqual([expect.objectContaining({ status: "candidate", invariantId: "INV-003" })]);
      expect(r.store.getFinding(`${r.report.plan.comparisonId}--${run.runId}`)?.status).toBe("candidate");
    }
    for (const s of summarizeArmsV2(r.report)) expect(s).toMatchObject({ faultyConfirmed: 0, errors: 1 });
  });

  it("a call refused before dispatch is not an action, not in toolsUsed, and is named in errorMessage", () => {
    const p = buildDefaultOfflinePlan({ explorerSeeds: ["s1"] });
    p.settings = { ...p.settings, toolAccess: p.settings.toolAccess.filter((t) => t !== "trade_cancel") };
    const r = runComparison(p).report;
    expect(issues(r)).toEqual([]); // no tool_outside_access: the refused tool was never dispatched
    const sk = r.runs.find((x) => x.arm === "scripted_known" && x.target.fixtureMode === "faulty")!;
    expect([sk.outcome, sk.stopReason, sk.actionsTaken]).toEqual(["error", "error", 2]);
    expect(sk.toolsUsed).toEqual(["trade_accept", "trade_create"]);
    expect(sk.errorMessage).toMatch(/trade_cancel refused before dispatch/);
    for (const x of r.runs.filter((x) => x.arm === "seeded_random")) expect(x.toolsUsed).not.toContain("trade_cancel");
  });

  it("a reset that does not match initialStateHash is an error before the first action with no campaign link", () => {
    const bad = buildDefaultOfflinePlan({ explorerSeeds: ["s1"] });
    bad.settings = { ...bad.settings, initialStateHash: "not-the-real-hash" };
    const { report: r, store: s } = runComparison(bad);
    expect(r.runs).toHaveLength(bad.plannedRuns.length);
    for (const run of r.runs) {
      expect([run.outcome, run.stopReason, run.actionsTaken]).toEqual(["error", "error", 0]);
      expect(s.getBenchmarkRunCampaignId(r.plan.comparisonId, run.runId)).toBeNull();
    }
  });

  it("a wrong buildId or targetId ends as error before the first action", () => {
    const p = buildDefaultOfflinePlan({ explorerSeeds: ["s1"] });
    for (const faulty of [
      { ...p.targets[0]!, buildId: "some-other-build" },
      { ...p.targets[0]!, targetId: "synthetic-trade-faulty-2" },
    ]) {
      expect(targetIdentityProblem(faulty)).toBeTruthy();
      const r = runComparison(withFaultyTarget(p, faulty)).report;
      expect(issues(r)).toEqual([]);
      for (const run of r.runs.filter((x) => x.target.fixtureMode === "faulty")) {
        expect([run.outcome, run.stopReason, run.actionsTaken]).toEqual(["error", "error", 0]);
        expect(run.finalStateHash).toBeUndefined();
      }
    }
  });

  it("toolAccess order does not change seeded_random behaviour", () => {
    const p = buildDefaultOfflinePlan({ explorerSeeds: ["s1", "s2"] });
    const forward = runComparison(p);
    const back = runComparison({ ...p, settings: { ...p.settings, toolAccess: [...p.settings.toolAccess].reverse() } });
    expect(withoutWall(back.report).runs).toEqual(withoutWall(forward.report).runs);
    expect(back.traces).toEqual(forward.traces);
  });

  it("refuses a comparison id that already exists in the store", () => {
    const s = new EvidenceStore(":memory:");
    runComparison(buildDefaultOfflinePlan({ explorerSeeds: ["s1"] }), { store: s });
    expect(() => runComparison(buildDefaultOfflinePlan({ explorerSeeds: ["s1"] }), { store: s })).toThrow(/already exists/);
  });

  it("a harness crash mid-comparison still exports, and validation fails with missing_run", () => {
    const s = new EvidenceStore(":memory:");
    const p = buildDefaultOfflinePlan({ explorerSeeds: ["s1"] });
    let n = 0;
    expect(() =>
      runComparison(p, {
        store: s,
        hooks: {
          afterRun: () => {
            n += 1;
            if (n === 2) throw new Error("simulated crash");
          },
        },
      }),
    ).toThrow(/simulated crash/);
    const exported = s.exportBenchmarkReport(p.comparisonId);
    expect(exported.runs.map((r) => r.runId)).toEqual(p.plannedRuns.slice(0, 2).map((x) => x.runId));
    const v = validateComparisonV2(exported);
    expect(v.issues.filter((i) => i.code === "missing_run")).toHaveLength(p.plannedRuns.length - 2);
    expect(summarizeArmsV2(exported).every((a) => !a.comparable)).toBe(true);
  });

  it("runner path has no Math.random", () => {
    for (const file of [
      "packages/campaign/src/benchmark-runner.ts",
      "packages/campaign/src/scripted-runner.ts",
      "scripts/bench-rb015.ts",
    ])
      expect(readFileSync(resolve(file), "utf8")).not.toMatch(/Math\.random/);
  });

  it("bench:rb015 end to end: run -> store -> export -> validate, then refuses the same id", () => {
    const dir = mkdtempSync(join(tmpdir(), "rb015-bench-"));
    const args = [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/bench-rb015.ts"), "--store-dir", dir, "--seeds", "a,b,c"];
    const env = { ...process.env, RULEBREAK_LIVE_ENABLED: "false" };
    const res = spawnSync(process.execPath, args, { encoding: "utf8", env });
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toMatch(/validateComparisonV2: clean/);
    const dbPath = join(dir, "rb015-offline-v2.sqlite");
    expect(existsSync(dbPath)).toBe(true);
    const written = ComparisonReportV2Schema.parse(JSON.parse(readFileSync(join(dir, "rb015-offline-v2.report.json"), "utf8")));
    expect(issues(written)).toEqual([]);
    expect(written.runs).toHaveLength(2 * 2 * 3);
    const reopened = new EvidenceStore(dbPath);
    expect(withoutWall(reopened.exportBenchmarkReport("rb015-offline-v2"))).toEqual(withoutWall(written));
    reopened.close();
    const again = spawnSync(process.execPath, args, { encoding: "utf8", env });
    expect(again.status).not.toBe(0);
    expect(again.stderr).toMatch(/already exists/);
  }, 60_000);
});
