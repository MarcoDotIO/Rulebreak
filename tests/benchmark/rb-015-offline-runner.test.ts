import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  LIVE_GATE_NOT_RUN_REASON,
  SeededChooser,
  buildDefaultOfflinePlan,
  resolveOutcome,
  runComparison,
} from "@rulebreak/campaign";
import {
  ComparisonReportSchema,
  comparableSettingsKey,
  summarizeArms,
  validateComparison,
  type ComparisonReport,
} from "@rulebreak/contracts";

function withoutWall(report: ComparisonReport) {
  return { ...report, runs: report.runs.map(({ wallSeconds: _w, ...rest }) => rest) };
}

describe("RB-015 offline runner", () => {
  const plan = buildDefaultOfflinePlan();
  const { report, traces } = runComparison(plan);

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
    expect(Array.from({ length: 16 }, () => a.int(1000))).toEqual(
      Array.from({ length: 16 }, () => b.int(1000)),
    );
  });

  it("covers the full arms x targets x seeds grid with exactly one record per planned run", () => {
    expect(plan.explorerSeeds.length).toBeGreaterThanOrEqual(3);
    expect(report.runs).toHaveLength(plan.plannedRuns.length);
    expect(report.runs).toHaveLength(plan.arms.length * plan.targets.length * plan.explorerSeeds.length);
    const cells = new Set(report.runs.map((r) => `${r.arm}|${r.target.targetId}|${r.explorerSeed}`));
    expect(cells.size).toBe(report.runs.length);
    expect(report.runs.map((r) => r.runId)).toEqual(plan.plannedRuns.map((p) => p.runId));
    expect(new Set(plan.targets.map((t) => t.fixtureMode))).toEqual(new Set(["faulty", "fixed"]));
    expect(() => ComparisonReportSchema.parse(report)).not.toThrow();
  });

  it("validateComparison is clean", () => {
    expect(validateComparison(report)).toEqual([]);
  });

  it("stamps one settingsKey, $0 cost, and arm provenance on every run", () => {
    const key = comparableSettingsKey(plan.settings);
    for (const r of report.runs) {
      expect(r.settingsKey).toBe(key);
      expect(r.costUsd).toBe(0);
      expect(r.actionsTaken).toBeLessThanOrEqual(plan.settings.maxActions);
      expect(r.provenance).toBe(r.arm === "scripted_known" ? "scripted" : "recorded");
    }
  });

  it("scripted_known confirms INV-003 on faulty and does not confirm on fixed", () => {
    const sk = report.runs.filter((r) => r.arm === "scripted_known");
    for (const r of sk.filter((r) => r.target.fixtureMode === "faulty")) {
      expect(r.outcome).toBe("confirmed_finding");
      expect(r.findings).toEqual([
        expect.objectContaining({ status: "confirmed", invariantId: "INV-003", firstActionIndex: 2 }),
      ]);
    }
    for (const r of sk.filter((r) => r.target.fixtureMode === "fixed")) {
      expect(r.outcome).toBe("no_finding");
      expect(r.findings).toEqual([]);
    }
  });

  it("fixed-target false confirmations are 0 for every arm", () => {
    const summary = summarizeArms(report);
    for (const s of summary) {
      expect(s.cleanFalseConfirmations).toBe(0);
      expect(s.comparable).toBe(true);
      expect(s.totalCostUsd).toBe(0);
    }
    expect(report.runs.filter((r) => r.target.fixtureMode === "fixed" && r.outcome === "confirmed_finding")).toEqual([]);
  });

  it("records planned LLM arms as not_run with a reason, never as zero findings", () => {
    const withLlm = runComparison(buildDefaultOfflinePlan({ includeLlmArms: true })).report;
    expect(validateComparison(withLlm)).toEqual([]);
    const llm = withLlm.runs.filter((r) => r.arm === "llm_single" || r.arm === "llm_dual");
    expect(llm).toHaveLength(2 * 2 * withLlm.plan.explorerSeeds.length);
    for (const r of llm) {
      expect(r.outcome).toBe("not_run");
      expect(r.notRunReason).toBe(LIVE_GATE_NOT_RUN_REASON);
      expect(r.notRunReason).toMatch(/live gate not approved/);
      expect(r.actionsTaken).toBe(0);
      expect(r.findings).toEqual([]);
      expect(r.costUsd).toBe(0);
    }
    const summary = summarizeArms(withLlm);
    for (const s of summary.filter((s) => s.arm.startsWith("llm_"))) {
      expect(s).toMatchObject({ executed: 0, comparable: false, faultyConfirmed: 0 });
      expect(s.notRun).toBe(s.planned);
    }
  });

  it("enforces maxActions for every arm", () => {
    const small = runComparison(buildDefaultOfflinePlan({ maxActions: 2 })).report;
    expect(validateComparison(small)).toEqual([]);
    for (const r of small.runs) {
      expect(r.actionsTaken).toBeLessThanOrEqual(2);
      expect(r.outcome).toBe("budget_exhausted");
    }
  });

  it("maxWallSeconds cutoff is budget_exhausted (clock is injected, not used for choices)", () => {
    let t = 0;
    const r = runComparison(buildDefaultOfflinePlan({ maxWallSeconds: 1, explorerSeeds: ["s1"] }), {
      now: () => (t += 600),
    }).report;
    expect(validateComparison(r)).toEqual([]);
    for (const run of r.runs) expect(run.outcome).toBe("budget_exhausted");
  });

  it("operator abort is recorded as aborted, not dropped", () => {
    const r = runComparison(buildDefaultOfflinePlan({ explorerSeeds: ["s1"] }), {
      shouldAbort: (_id, n) => n >= 1,
    }).report;
    expect(validateComparison(r)).toEqual([]);
    for (const run of r.runs) {
      expect(run.outcome).toBe("aborted");
      expect(run.actionsTaken).toBe(1);
    }
    expect(summarizeArms(r).every((s) => s.aborted === 2 && s.executed === 2)).toBe(true);
  });

  it("a reset that does not match initialStateHash is an error record, not a silent skip", () => {
    const bad = buildDefaultOfflinePlan({ explorerSeeds: ["s1"] });
    bad.settings = { ...bad.settings, initialStateHash: "not-the-real-hash" };
    const r = runComparison(bad).report;
    expect(r.runs).toHaveLength(bad.plannedRuns.length);
    for (const run of r.runs) {
      expect(run.outcome).toBe("error");
      expect(run.actionsTaken).toBe(0);
    }
    expect(summarizeArms(r).every((s) => s.errors === 2 && s.executed === 2)).toBe(true);
  });

  it("toolAccess order does not change seeded_random behaviour", () => {
    const reversed = buildDefaultOfflinePlan({ explorerSeeds: ["s1", "s2"] });
    const forward = runComparison(reversed);
    reversed.settings = { ...reversed.settings, toolAccess: [...reversed.settings.toolAccess].reverse() };
    const back = runComparison(reversed);
    expect(withoutWall(back.report).runs).toEqual(withoutWall(forward.report).runs);
    expect(back.traces).toEqual(forward.traces);
  });

  it("outcome precedence: confirmed > error > aborted > budget_exhausted > candidate_only > no_finding", () => {
    const f = { confirmed: false, error: false, aborted: false, budgetExhausted: false, candidate: false };
    expect(resolveOutcome({ ...f, confirmed: true, error: true, aborted: true, budgetExhausted: true, candidate: true })).toBe("confirmed_finding");
    expect(resolveOutcome({ ...f, error: true, aborted: true, budgetExhausted: true, candidate: true })).toBe("error");
    expect(resolveOutcome({ ...f, aborted: true, budgetExhausted: true, candidate: true })).toBe("aborted");
    expect(resolveOutcome({ ...f, budgetExhausted: true, candidate: true })).toBe("budget_exhausted");
    expect(resolveOutcome({ ...f, candidate: true })).toBe("candidate_only");
    expect(resolveOutcome(f)).toBe("no_finding");
  });

  it("runner path has no Math.random", () => {
    for (const file of [
      "packages/campaign/src/benchmark-runner.ts",
      "packages/campaign/src/scripted-runner.ts",
      "scripts/bench-rb015.ts",
    ])
      expect(readFileSync(resolve(file), "utf8")).not.toMatch(/Math\.random/);
  });

  it("bench:rb015 runs clean and writes a valid report", () => {
    const dir = mkdtempSync(join(tmpdir(), "rb015-bench-"));
    const out = join(dir, "report.json");
    const res = spawnSync(
      process.execPath,
      [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/bench-rb015.ts"), "--out", out, "--seeds", "a,b,c"],
      { encoding: "utf8", env: { ...process.env, RULEBREAK_LIVE_ENABLED: "false" } },
    );
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toMatch(/validateComparison: clean/);
    expect(existsSync(out)).toBe(true);
    const written = ComparisonReportSchema.parse(JSON.parse(readFileSync(out, "utf8")));
    expect(validateComparison(written)).toEqual([]);
    expect(written.runs).toHaveLength(2 * 2 * 3);
  }, 60_000);
});
