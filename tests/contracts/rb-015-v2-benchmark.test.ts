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
          toolsUsed: ["trade_accept", "trade_cancel", "trade_create"],
          finalStateHash: "h1",
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
  it("settings key ignores tool order", () => {
    expect(comparableSettingsKey({ ...settings, toolAccess: [...settings.toolAccess].reverse() })).toBe(key);
  });

  it("accepts a complete comparable matrix with no warnings", () => {
    expect(validateComparisonV2(report())).toEqual({ issues: [], warnings: [] });
  });

  it("not_reproduced is its own outcome and outranks budget_exhausted", () => {
    expect(resolveOutcomeV2("max_actions", { confirmed: false, error: false, notReproduced: true, candidate: true })).toBe(
      "not_reproduced",
    );
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

  it("a budget-stopped run can still end not_reproduced or confirmed after replay", () => {
    const nr = { findingId: "f", status: "not_reproduced" as const, invariantId: "INV-003" as const, firstActionIndex: 2 };
    for (const stopReason of ["max_actions", "max_wall_seconds"] as const) {
      expect(RunRecordV2Schema.parse({ ...base(), outcome: "not_reproduced", stopReason, findings: [nr] }).outcome).toBe("not_reproduced");
      expect(RunRecordV2Schema.parse({ ...base(), stopReason }).outcome).toBe("confirmed_finding");
    }
  });

  it("every pair resolveOutcomeV2 produces is accepted by the schema", () => {
    const stops = ["natural", "first_violation", "max_actions", "max_wall_seconds", "operator_abort", "error"] as const;
    const f = (status: "confirmed" | "not_reproduced" | "candidate") => ({
      findingId: "f", status, invariantId: "INV-003" as const, firstActionIndex: 2,
    });
    for (const stop of stops)
      for (let bits = 0; bits < 16; bits++) {
        const flags = { confirmed: !!(bits & 1), error: !!(bits & 2), notReproduced: !!(bits & 4), candidate: !!(bits & 8) };
        const forced = stop === "error" || stop === "operator_abort";
        const findings = [
          ...(flags.confirmed ? [f("confirmed")] : []),
          ...(flags.notReproduced ? [f("not_reproduced")] : []),
          ...(flags.candidate ? [f("candidate")] : []),
        ].map((x) => (forced ? { ...x, status: "candidate" as const } : x));
        if (stop === "first_violation" && findings.length === 0) continue;
        const outcome = resolveOutcomeV2(stop, flags);
        const rec = {
          ...base(),
          outcome,
          stopReason: stop,
          actionsTaken: 10,
          findings: outcome === "no_finding" || outcome === "budget_exhausted" ? [] : findings,
          ...(outcome === "error" ? { errorMessage: "boom" } : {}),
        };
        if (outcome === "confirmed_finding" || rec.findings.every((x) => x.status !== "confirmed"))
          expect(RunRecordV2Schema.safeParse(rec).success, `${stop} ${JSON.stringify(flags)} -> ${outcome}`).toBe(true);
      }
  });

  it("loop stops error and operator_abort force their outcome", () => {
    const none = { confirmed: true, error: false, notReproduced: false, candidate: false };
    expect(resolveOutcomeV2("error", none)).toBe("error");
    expect(resolveOutcomeV2("operator_abort", none)).toBe("aborted");
    expect(resolveOutcomeV2("first_violation", { ...none, confirmed: false, error: true })).toBe("error");
  });

  it("first_violation needs a finding, and errorMessage lives only on error", () => {
    expect(() => RunRecordV2Schema.parse({ ...base(), outcome: "no_finding", stopReason: "first_violation", findings: [] })).toThrow(/first_violation/);
    expect(() => RunRecordV2Schema.parse({ ...base(), errorMessage: "x" })).toThrow(/errorMessage/);
    expect(
      RunRecordV2Schema.parse({
        ...base(),
        outcome: "error",
        stopReason: "first_violation",
        errorMessage: "replay threw",
        findings: [{ findingId: "f", status: "candidate", invariantId: "INV-003", firstActionIndex: 2 }],
      }).outcome,
    ).toBe("error");
  });

  it("toolsUsed is sorted and executed runs carry finalStateHash", () => {
    expect(() => RunRecordV2Schema.parse({ ...base(), toolsUsed: ["trade_create", "trade_accept"] })).toThrow(/sorted/);
    const { finalStateHash: _h, ...noHash } = base();
    expect(() => RunRecordV2Schema.parse(noHash)).toThrow(/finalStateHash/);
    expect(
      RunRecordV2Schema.parse({ ...noHash, outcome: "error", stopReason: "error", errorMessage: "bad target", actionsTaken: 0, findings: [], toolsUsed: [] }).outcome,
    ).toBe("error");
  });

  it("max_actions stop must use the whole budget, and plans reject duplicate targets", () => {
    const r = report();
    r.runs[0] = { ...r.runs[0]!, stopReason: "max_actions" };
    expect(codes(r)).toContain("stop_budget_mismatch");
    const d = report();
    d.plan.targets.push(faulty);
    expect(codes(d)).toContain("duplicate_target");
  });

  it("runs must be exported in plannedRuns order", () => {
    const r = report();
    r.runs.reverse();
    expect(codes(r)).toEqual(["run_order"]);
  });

  it("budget_exhausted cannot hide a candidate or demoted finding", () => {
    for (const status of ["candidate", "not_reproduced", "inconclusive"] as const)
      expect(() =>
        RunRecordV2Schema.parse({
          ...base(),
          outcome: "budget_exhausted",
          stopReason: "max_actions",
          findings: [{ findingId: "f", status, invariantId: "INV-003", firstActionIndex: 2 }],
        }),
      ).toThrow(/budget_exhausted cannot carry findings/);
  });

  it("a forced stop leaves findings candidate, and first_violation without findings throws", () => {
    for (const [outcome, stopReason] of [["error", "error"], ["aborted", "operator_abort"]] as const)
      expect(() =>
        RunRecordV2Schema.parse({
          ...base(),
          outcome,
          stopReason,
          ...(outcome === "error" ? { errorMessage: "x" } : {}),
          findings: [{ findingId: "f", status: "not_reproduced", invariantId: "INV-003", firstActionIndex: 2 }],
        }),
      ).toThrow(/stays candidate/);
    expect(() =>
      resolveOutcomeV2("first_violation", { confirmed: false, error: false, notReproduced: false, candidate: false }),
    ).toThrow(/first_violation/);
  });

  it("stopReason must agree with outcome", () => {
    expect(() => RunRecordV2Schema.parse({ ...base(), outcome: "budget_exhausted", stopReason: "natural", findings: [] })).toThrow();
    expect(() => RunRecordV2Schema.parse({ ...base(), outcome: "no_finding", stopReason: "max_actions", findings: [] })).toThrow();
    expect(() => RunRecordV2Schema.parse({ ...base(), outcome: "error", stopReason: "error", findings: [] })).toThrow(/errorMessage/);
    expect(() => RunRecordV2Schema.parse({ ...base(), outcome: "aborted", stopReason: "error", findings: [] })).toThrow();
  });

  it("wall-time cutoffs are warnings, counted in the summary", () => {
    const r = report();
    const i = r.runs.findIndex((x) => x.runId === "seeded_random-fixed-s1");
    r.runs[i] = { ...r.runs[i]!, outcome: "budget_exhausted", stopReason: "max_wall_seconds" };
    const v = validateComparisonV2(r);
    expect(v.issues).toEqual([]);
    expect(v.warnings.map((w) => w.code)).toEqual(["wall_time_cutoff"]);
    expect(summarizeArmsV2(r)[1]).toMatchObject({ wallTimeCutoffs: 1, comparable: true, comparableFullBudget: false });
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
        finalStateHash: undefined,
      }),
    ).toThrow(/tools/);
  });
});
