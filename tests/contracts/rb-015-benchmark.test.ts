import { describe, expect, it } from "vitest";
import {
  ComparisonReportSchema,
  RunRecordSchema,
  comparableSettingsKey,
  summarizeArms,
  validateComparison,
  type ComparableSettings,
  type ComparisonReport,
  type RunRecord,
} from "@rulebreak/contracts";

const settings: ComparableSettings = {
  schemaVersion: 1,
  rulePackId: "p0",
  rulePackVersion: "1",
  worldSeed: "rulebreak-v0-default",
  initialStateHash: "h0",
  resetProcedureId: "reset-v1",
  toolAccess: ["trade_create", "economy_observe", "trade_accept", "trade_cancel"],
  maxActions: 200,
  maxWallSeconds: 60,
  spendCapUsd: 0,
};
const faulty = { targetId: "faulty", fixtureMode: "faulty" as const, buildId: "b1" };
const fixed = { targetId: "fixed", fixtureMode: "fixed" as const, buildId: "b1" };
const key = comparableSettingsKey(settings);

function report(): ComparisonReport {
  const plannedRuns = [];
  const runs: RunRecord[] = [];
  for (const arm of ["scripted_known", "seeded_random"] as const)
    for (const target of [faulty, fixed])
      for (const explorerSeed of ["s1", "s2"]) {
        const runId = `${arm}-${target.targetId}-${explorerSeed}`;
        plannedRuns.push({ runId, arm, target, explorerSeed });
        const hit = target.fixtureMode === "faulty";
        runs.push({
          schemaVersion: 1,
          comparisonId: "cmp-1",
          runId,
          arm,
          target,
          explorerSeed,
          settingsKey: key,
          provenance: arm === "scripted_known" ? "scripted" : "recorded",
          outcome: hit ? "confirmed_finding" : "no_finding",
          actionsTaken: 10,
          wallSeconds: 0.5,
          costUsd: 0,
          findings: hit
            ? [{ findingId: `f-${runId}`, status: "confirmed", invariantId: "INV-003", firstActionIndex: 4 }]
            : [],
          finalStateHash: "hz",
        });
      }
  return ComparisonReportSchema.parse({
    schemaVersion: 1,
    plan: {
      schemaVersion: 1,
      comparisonId: "cmp-1",
      settings,
      arms: [
        { arm: "scripted_known", scriptId: "p0-known" },
        { arm: "seeded_random", generatorId: "mulberry32-v1" },
      ],
      targets: [faulty, fixed],
      explorerSeeds: ["s1", "s2"],
      plannedRuns,
      heldBackVariations: "none; engineering check only",
    },
    runs,
  });
}

describe("RB-015 comparison contract", () => {
  it("accepts a complete, comparable offline matrix", () => {
    expect(validateComparison(report())).toEqual([]);
  });

  it("settings key ignores tool order", () => {
    expect(comparableSettingsKey({ ...settings, toolAccess: [...settings.toolAccess].reverse() })).toBe(key);
  });

  it("rejects a dropped run instead of silently excluding it", () => {
    const r = report();
    r.runs = r.runs.slice(1);
    expect(validateComparison(r).map((i) => i.code)).toContain("missing_run");
  });

  it("rejects a run with different settings", () => {
    const r = report();
    r.runs[0] = { ...r.runs[0]!, settingsKey: comparableSettingsKey({ ...settings, maxActions: 999 }) };
    expect(validateComparison(r).map((i) => i.code)).toContain("settings_mismatch");
  });

  it("requires a clean control target", () => {
    const r = report();
    r.plan.targets = [faulty, { ...faulty, targetId: "faulty-2" }];
    expect(validateComparison(r).map((i) => i.code)).toContain("no_clean_control");
  });

  it("flags spend over the cap", () => {
    const r = report();
    r.runs[0] = { ...r.runs[0]!, costUsd: 0.01 };
    expect(validateComparison(r).map((i) => i.code)).toContain("over_spend");
  });

  it("not_run is a recorded outcome, never a zero result", () => {
    expect(() =>
      RunRecordSchema.parse({ ...report().runs[0]!, outcome: "not_run", findings: [], actionsTaken: 0 }),
    ).toThrow(/notRunReason/);
  });

  it("outcome must agree with finding status", () => {
    expect(() => RunRecordSchema.parse({ ...report().runs[2]!, outcome: "confirmed_finding" })).toThrow();
  });

  it("summary counts clean false confirmations and marks arms comparable only when complete", () => {
    const s = summarizeArms(report());
    expect(s[0]).toMatchObject({ planned: 4, executed: 4, faultyConfirmed: 2, cleanFalseConfirmations: 0, medianActionsToFirstConfirmed: 5, distinctInvariants: 1, aborted: 0, comparable: true });
  });
});
