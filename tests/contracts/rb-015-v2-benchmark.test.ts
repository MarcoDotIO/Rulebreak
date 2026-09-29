import { describe, expect, it } from "vitest";
import {
  ComparisonReportV2Schema,
  RunRecordV2Schema,
  comparableSettingsKey,
  resolveOutcomeV2,
  summarizeArmsV2,
  validateComparisonV2,
  type ComparableSettings,
  type ComparisonReportV2,
  type PlannedRun,
  type RunRecordV2,
} from "@rulebreak/contracts";

const settings: ComparableSettings = {
  schemaVersion: 1,
  rulePackId: "p0",
  rulePackVersion: "1",
  worldSeed: "w",
  initialStateHash: "h0",
  resetProcedureId: "reset-v1",
  toolAccess: ["economy_observe", "trade_accept", "trade_cancel", "trade_create"],
  maxActions: 200,
  maxWallSeconds: 60,
  spendCapUsd: 0,
};
const faulty = { targetId: "faulty", fixtureMode: "faulty" as const, buildId: "b1" };
const fixed = { targetId: "fixed", fixtureMode: "fixed" as const, buildId: "b1" };
const key = comparableSettingsKey(settings);

function report(): ComparisonReportV2 {
  const plannedRuns: PlannedRun[] = [];
  const runs: RunRecordV2[] = [];
  for (const arm of ["scripted_known", "seeded_random"] as const)
    for (const target of [faulty, fixed])
      for (const explorerSeed of ["s1", "s2"]) {
        const runId = `${arm}-${target.targetId}-${explorerSeed}`;
        plannedRuns.push({ runId, arm, target, explorerSeed });
        const hit = target.fixtureMode === "faulty";
        runs.push({
          schemaVersion: 1,
          contractVersion: 2,
          comparisonId: "cmp",
          runId,
          arm,
          target,
          explorerSeed,
          settingsKey: key,
          provenance: arm === "scripted_known" ? "scripted" : "recorded",
          outcome: hit ? "confirmed_finding" : "no_finding",
          stopReason: hit ? "first_violation" : "natural",
          actionsTaken: 10,
          wallSeconds: 0.1,
          costUsd: 0,
          toolsUsed: ["trade_create", "trade_accept", "trade_cancel"],
          findings: hit
            ? [{ findingId: `f-${runId}`, status: "confirmed", invariantId: "INV-003", firstActionIndex: 2 }]
            : [],
        });
      }
  return ComparisonReportV2Schema.parse({
    schemaVersion: 1,
    contractVersion: 2,
    plan: {
      schemaVersion: 1,
      comparisonId: "cmp",
      settings,
      arms: [
        { arm: "scripted_known", scriptId: "k" },
        { arm: "seeded_random", generatorId: "g" },
      ],
      targets: [faulty, fixed],
      explorerSeeds: ["s1", "s2"],
      plannedRuns,
      heldBackVariations: "none",
    },
    runs,
  });
}
const codes = (r: ComparisonReportV2) => validateComparisonV2(r).issues.map((i) => i.code);
const base = () => report().runs[0]!;

describe("RB-015 contract v2", () => {
  it("accepts a complete comparable matrix with no warnings", () => {
    expect(validateComparisonV2(report())).toEqual({ issues: [], warnings: [] });
  });

  it("not_reproduced is its own outcome and outranks budget_exhausted", () => {
    expect(
      resolveOutcomeV2({ confirmed: false, error: false, aborted: false, notReproduced: true, budgetExhausted: true, candidate: true }),
    ).toBe("not_reproduced");
    const r = RunRecordV2Schema.parse({
      ...base(),
      outcome: "not_reproduced",
      stopReason: "first_violation",
      findings: [{ findingId: "f", status: "not_reproduced", invariantId: "INV-003", firstActionIndex: 2 }],
    });
    expect(r.outcome).toBe("not_reproduced");
  });

  it("no_finding cannot hide a demoted finding", () => {
    expect(() =>
      RunRecordV2Schema.parse({
        ...base(),
        outcome: "no_finding",
        stopReason: "natural",
        findings: [{ findingId: "f", status: "not_reproduced", invariantId: "INV-003", firstActionIndex: 2 }],
      }),
    ).toThrow();
  });

  it("stopReason must agree with outcome", () => {
    expect(() => RunRecordV2Schema.parse({ ...base(), outcome: "budget_exhausted", stopReason: "natural", findings: [] })).toThrow();
    expect(() => RunRecordV2Schema.parse({ ...base(), outcome: "no_finding", stopReason: "max_actions", findings: [] })).toThrow();
    expect(() => RunRecordV2Schema.parse({ ...base(), outcome: "error", stopReason: "error", findings: [] })).toThrow(/errorMessage/);
  });

  it("wall-time cutoffs are warnings, counted in the summary", () => {
    const r = report();
    const i = r.runs.findIndex((x) => x.runId === "seeded_random-fixed-s1");
    r.runs[i] = { ...r.runs[i]!, outcome: "budget_exhausted", stopReason: "max_wall_seconds" };
    const v = validateComparisonV2(r);
    expect(v.issues).toEqual([]);
    expect(v.warnings.map((w) => w.code)).toEqual(["wall_time_cutoff"]);
    expect(summarizeArmsV2(r)[1]).toMatchObject({ wallTimeCutoffs: 1, comparable: true });
  });

  it("rejects tools outside toolAccess", () => {
    const r = report();
    r.runs[0] = { ...r.runs[0]!, toolsUsed: ["strategy_note"] };
    expect(codes(r)).toContain("tool_outside_access");
  });

  it("reports a duplicate planned cell as a duplicate", () => {
    const r = report();
    r.plan.plannedRuns.push({ ...r.plan.plannedRuns[0]!, runId: "extra" });
    expect(codes(r)).toContain("duplicate_planned_cell");
    expect(codes(r)).not.toContain("unplanned_cell");
  });

  it("rejects a run whose build differs from the plan", () => {
    const r = report();
    r.runs[0] = { ...r.runs[0]!, target: { ...faulty, buildId: "other" } };
    expect(codes(r)).toContain("run_plan_mismatch");
  });

  it("summary is never comparable while validation has issues", () => {
    const r = report();
    r.runs = r.runs.slice(1);
    expect(summarizeArmsV2(r).every((a) => !a.comparable)).toBe(true);
  });

  it("not_run carries no tools or spend", () => {
    expect(() =>
      RunRecordV2Schema.parse({
        ...base(),
        outcome: "not_run",
        stopReason: "not_run",
        notRunReason: "gate",
        actionsTaken: 0,
        findings: [],
      }),
    ).toThrow(/tools/);
  });
});
