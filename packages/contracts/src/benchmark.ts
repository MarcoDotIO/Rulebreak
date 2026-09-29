import { z } from "zod";
import { ExplorerToolNameSchema } from "./mcp.js";
import { InvariantIdSchema } from "./rules.js";
import { FindingStatusSchema, ProvenanceModeSchema, TargetFixtureModeSchema } from "./records.js";
import { FindingIdSchema, SchemaVersionSchema, StateHashSchema } from "./primitives.js";

/**
 * RB-015 seeded baseline and honest comparison (AGENTS.md §14 "Compare exploration honestly").
 * Semantics: docs/contracts/rb-015-baseline.md.
 */

const Id = z.string().min(1).max(128);
const Seed = z.string().min(1).max(128);

export const BenchmarkArmSchema = z.enum([
  "scripted_known",
  "seeded_random",
  "llm_single",
  "llm_dual",
]);
export type BenchmarkArm = z.infer<typeof BenchmarkArmSchema>;

/** Arms that may run in ordinary offline CI. LLM arms need the live gate. */
export const OFFLINE_ARMS: readonly BenchmarkArm[] = ["scripted_known", "seeded_random"];

export const BenchmarkTargetSchema = z.object({
  targetId: Id,
  fixtureMode: TargetFixtureModeSchema,
  buildId: Id,
});
export type BenchmarkTarget = z.infer<typeof BenchmarkTargetSchema>;

/**
 * Everything that must be identical for every run in one comparison.
 * Target identity is not here: a comparison runs every arm against both targets.
 */
export const ComparableSettingsSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    rulePackId: Id,
    rulePackVersion: z.string().min(1).max(64),
    worldSeed: Seed,
    initialStateHash: StateHashSchema,
    resetProcedureId: Id,
    toolAccess: z.array(ExplorerToolNameSchema).min(1),
    maxActions: z.number().int().positive().max(100_000),
    maxWallSeconds: z.number().int().positive().max(86_400),
    spendCapUsd: z.number().nonnegative().finite(),
  })
  .strict();
export type ComparableSettings = z.infer<typeof ComparableSettingsSchema>;

/** Canonical key for equality checks. Tool list is order-insensitive. */
export function comparableSettingsKey(s: ComparableSettings): string {
  const { toolAccess, ...rest } = s;
  const sorted = Object.fromEntries(Object.entries(rest).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify({ ...sorted, toolAccess: [...new Set(toolAccess)].sort() });
}

/** Per-arm details that are allowed to differ, and must be recorded. */
export const ArmConfigSchema = z.discriminatedUnion("arm", [
  z.object({ arm: z.literal("scripted_known"), scriptId: Id }).strict(),
  z.object({ arm: z.literal("seeded_random"), generatorId: Id }).strict(),
  z
    .object({ arm: z.literal("llm_single"), modelId: Id, promptVersion: Id, provider: Id })
    .strict(),
  z
    .object({ arm: z.literal("llm_dual"), modelId: Id, promptVersion: Id, provider: Id })
    .strict(),
]);
export type ArmConfig = z.infer<typeof ArmConfigSchema>;

export const PlannedRunSchema = z
  .object({
    runId: Id,
    arm: BenchmarkArmSchema,
    target: BenchmarkTargetSchema,
    explorerSeed: Seed,
  })
  .strict();
export type PlannedRun = z.infer<typeof PlannedRunSchema>;

/** Declared before any run starts. Seeds cannot be added after results are seen. */
export const ComparisonPlanSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    comparisonId: Id,
    settings: ComparableSettingsSchema,
    arms: z.array(ArmConfigSchema).min(1),
    targets: z.array(BenchmarkTargetSchema).min(2),
    explorerSeeds: z.array(Seed).min(1),
    plannedRuns: z.array(PlannedRunSchema).min(1),
    heldBackVariations: z.string().max(2000),
  })
  .strict();
export type ComparisonPlan = z.infer<typeof ComparisonPlanSchema>;

export const RunOutcomeKindSchema = z.enum([
  "confirmed_finding",
  "candidate_only",
  "no_finding",
  "budget_exhausted",
  "error",
  "aborted",
  "not_run",
]);
export type RunOutcomeKind = z.infer<typeof RunOutcomeKindSchema>;

export const RunFindingSchema = z
  .object({
    findingId: FindingIdSchema,
    status: FindingStatusSchema,
    invariantId: InvariantIdSchema,
    firstActionIndex: z.number().int().nonnegative(),
  })
  .strict();

export const RunRecordSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    comparisonId: Id,
    runId: Id,
    arm: BenchmarkArmSchema,
    target: BenchmarkTargetSchema,
    explorerSeed: Seed,
    settingsKey: z.string().min(1),
    provenance: ProvenanceModeSchema,
    outcome: RunOutcomeKindSchema,
    notRunReason: z.string().min(1).max(500).optional(),
    actionsTaken: z.number().int().nonnegative(),
    wallSeconds: z.number().nonnegative().finite(),
    costUsd: z.number().nonnegative().finite(),
    findings: z.array(RunFindingSchema),
    finalStateHash: StateHashSchema.optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    const confirmed = r.findings.some((f) => f.status === "confirmed");
    if (r.outcome === "confirmed_finding" && !confirmed)
      ctx.addIssue({ code: "custom", message: "confirmed_finding needs a confirmed finding" });
    if (r.outcome !== "confirmed_finding" && confirmed)
      ctx.addIssue({ code: "custom", message: "confirmed finding requires outcome confirmed_finding" });
    if (r.outcome === "candidate_only" && !r.findings.some((f) => f.status === "candidate"))
      ctx.addIssue({ code: "custom", message: "candidate_only needs a candidate finding" });
    if (r.outcome === "not_run" && !r.notRunReason)
      ctx.addIssue({ code: "custom", message: "not_run needs notRunReason" });
    if (r.outcome === "not_run" && (r.actionsTaken > 0 || r.findings.length > 0))
      ctx.addIssue({ code: "custom", message: "not_run cannot carry actions or findings" });
  });
export type RunRecord = z.infer<typeof RunRecordSchema>;

export const ComparisonReportSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    plan: ComparisonPlanSchema,
    runs: z.array(RunRecordSchema),
  })
  .strict();
export type ComparisonReport = z.infer<typeof ComparisonReportSchema>;

export type ComparisonIssue = { code: string; message: string; runId?: string };

/**
 * Honesty checks a report must pass before any arm-vs-arm number is shown.
 * Returns [] when the comparison is complete and comparable.
 */
export function validateComparison(report: ComparisonReport): ComparisonIssue[] {
  const issues: ComparisonIssue[] = [];
  const { plan, runs } = report;
  const key = comparableSettingsKey(plan.settings);
  const armConfigs = new Set(plan.arms.map((a) => a.arm));

  if (!plan.targets.some((t) => t.fixtureMode === "faulty"))
    issues.push({ code: "no_faulty_target", message: "plan needs a faulty target" });
  if (!plan.targets.some((t) => t.fixtureMode === "fixed"))
    issues.push({ code: "no_clean_control", message: "plan needs a fixed (clean) target" });

  const expected = new Set<string>();
  for (const a of plan.arms)
    for (const t of plan.targets)
      for (const s of plan.explorerSeeds) expected.add(`${a.arm}|${t.targetId}|${s}`);
  const planned = new Map<string, PlannedRun>();
  for (const p of plan.plannedRuns) {
    const cell = `${p.arm}|${p.target.targetId}|${p.explorerSeed}`;
    if (!expected.has(cell))
      issues.push({ code: "unplanned_cell", message: `planned run outside matrix: ${cell}`, runId: p.runId });
    if (planned.has(p.runId))
      issues.push({ code: "duplicate_planned_run", message: "duplicate runId", runId: p.runId });
    planned.set(p.runId, p);
    expected.delete(cell);
  }
  for (const cell of expected)
    issues.push({ code: "matrix_gap", message: `matrix cell has no planned run: ${cell}` });

  const seen = new Set<string>();
  for (const r of runs) {
    const p = planned.get(r.runId);
    if (!p) {
      issues.push({ code: "unplanned_run", message: "run not in plan", runId: r.runId });
      continue;
    }
    if (seen.has(r.runId))
      issues.push({ code: "duplicate_run", message: "run recorded twice", runId: r.runId });
    seen.add(r.runId);
    if (r.comparisonId !== plan.comparisonId)
      issues.push({ code: "wrong_comparison", message: "comparisonId mismatch", runId: r.runId });
    if (r.arm !== p.arm || r.explorerSeed !== p.explorerSeed || r.target.targetId !== p.target.targetId)
      issues.push({ code: "run_plan_mismatch", message: "arm/seed/target differ from plan", runId: r.runId });
    if (r.settingsKey !== key)
      issues.push({ code: "settings_mismatch", message: "run used different settings", runId: r.runId });
    if (!armConfigs.has(r.arm))
      issues.push({ code: "unknown_arm", message: "arm has no config", runId: r.runId });
    if (r.actionsTaken > plan.settings.maxActions)
      issues.push({ code: "over_budget", message: "actionsTaken exceeds maxActions", runId: r.runId });
    if (r.costUsd > plan.settings.spendCapUsd)
      issues.push({ code: "over_spend", message: "costUsd exceeds spendCapUsd", runId: r.runId });
    if (OFFLINE_ARMS.includes(r.arm) && r.outcome !== "not_run" && r.provenance === "live")
      issues.push({ code: "offline_arm_live", message: "offline arm cannot be live", runId: r.runId });
    if (!OFFLINE_ARMS.includes(r.arm) && r.outcome !== "not_run" && r.provenance !== "live")
      issues.push({ code: "llm_arm_not_live", message: "LLM arm result must be live provenance", runId: r.runId });
  }
  for (const id of planned.keys())
    if (!seen.has(id))
      issues.push({ code: "missing_run", message: "planned run has no record (record not_run instead)", runId: id });

  return issues;
}

/** Per-arm summary. Rates are only emitted for arms whose every planned run executed. */
export type ArmSummary = {
  arm: BenchmarkArm;
  planned: number;
  executed: number;
  notRun: number;
  faultyRuns: number;
  faultyConfirmed: number;
  cleanRuns: number;
  cleanFalseConfirmations: number;
  errors: number;
  medianActionsToFirstConfirmed: number | null;
  totalCostUsd: number;
  totalWallSeconds: number;
  comparable: boolean;
};

export function summarizeArms(report: ComparisonReport): ArmSummary[] {
  const targetMode = new Map(report.plan.targets.map((t) => [t.targetId, t.fixtureMode]));
  return report.plan.arms.map(({ arm }) => {
    const rs = report.runs.filter((r) => r.arm === arm);
    const planned = report.plan.plannedRuns.filter((p) => p.arm === arm).length;
    const executed = rs.filter((r) => r.outcome !== "not_run");
    const faulty = executed.filter((r) => targetMode.get(r.target.targetId) === "faulty");
    const clean = executed.filter((r) => targetMode.get(r.target.targetId) === "fixed");
    const firsts = faulty
      .map((r) =>
        Math.min(
          ...r.findings.filter((f) => f.status === "confirmed").map((f) => f.firstActionIndex),
        ),
      )
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const mid = firsts.length
      ? firsts.length % 2
        ? firsts[(firsts.length - 1) / 2]!
        : (firsts[firsts.length / 2 - 1]! + firsts[firsts.length / 2]!) / 2
      : null;
    return {
      arm,
      planned,
      executed: executed.length,
      notRun: rs.filter((r) => r.outcome === "not_run").length,
      faultyRuns: faulty.length,
      faultyConfirmed: faulty.filter((r) => r.outcome === "confirmed_finding").length,
      cleanRuns: clean.length,
      cleanFalseConfirmations: clean.filter((r) => r.outcome === "confirmed_finding").length,
      errors: executed.filter((r) => r.outcome === "error").length,
      medianActionsToFirstConfirmed: mid,
      totalCostUsd: executed.reduce((n, r) => n + r.costUsd, 0),
      totalWallSeconds: executed.reduce((n, r) => n + r.wallSeconds, 0),
      comparable: planned > 0 && executed.length === planned,
    };
  });
}
