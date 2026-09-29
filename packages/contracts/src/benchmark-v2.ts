import { z } from "zod";
import {
  BenchmarkArmSchema,
  BenchmarkTargetSchema,
  ComparisonPlanSchema,
  OFFLINE_ARMS,
  RunFindingSchema,
  comparableSettingsKey,
  type BenchmarkArm,
  type ComparisonIssue,
  type PlannedRun,
} from "./benchmark.js";
import { ExplorerToolNameSchema } from "./mcp.js";
import { ProvenanceModeSchema } from "./records.js";
import { SchemaVersionSchema, StateHashSchema } from "./primitives.js";

/**
 * RB-015 contract v2. Semantics: docs/contracts/rb-015-baseline.md §9.
 * v1 exports in benchmark.ts stay unchanged until the runner moves to v2.
 */

const Id = z.string().min(1).max(128);
const Seed = z.string().min(1).max(128);

export const BENCHMARK_CONTRACT_VERSION = 2 as const;
const ContractVersion = z.literal(BENCHMARK_CONTRACT_VERSION);

export const RunOutcomeKindV2Schema = z.enum([
  "confirmed_finding",
  "error",
  "aborted",
  "not_reproduced",
  "budget_exhausted",
  "candidate_only",
  "no_finding",
  "not_run",
]);
export type RunOutcomeKindV2 = z.infer<typeof RunOutcomeKindV2Schema>;

/** Why the run stopped. Separate from outcome so wall-time cutoffs are visible. */
export const StopReasonSchema = z.enum([
  "natural",
  "first_violation",
  "max_actions",
  "max_wall_seconds",
  "operator_abort",
  "error",
  "not_run",
]);
export type StopReason = z.infer<typeof StopReasonSchema>;

export type OutcomeFlagsV2 = {
  confirmed: boolean;
  error: boolean;
  aborted: boolean;
  /** A finding whose replay came back not_reproduced or inconclusive. */
  notReproduced: boolean;
  budgetExhausted: boolean;
  candidate: boolean;
};

/** Precedence (doc §9.1): confirmed > error > aborted > not_reproduced > budget_exhausted > candidate_only > no_finding. */
export function resolveOutcomeV2(f: OutcomeFlagsV2): Exclude<RunOutcomeKindV2, "not_run"> {
  if (f.confirmed) return "confirmed_finding";
  if (f.error) return "error";
  if (f.aborted) return "aborted";
  if (f.notReproduced) return "not_reproduced";
  if (f.budgetExhausted) return "budget_exhausted";
  if (f.candidate) return "candidate_only";
  return "no_finding";
}

const ANY_EXECUTED_STOP: readonly StopReason[] = [
  "natural",
  "first_violation",
  "max_actions",
  "max_wall_seconds",
  "operator_abort",
  "error",
];

/**
 * Allowed stop reasons per outcome (doc §9.2). Replay runs after the explorer stops, so a
 * confirmed or not_reproduced finding can follow a budget stop.
 */
export const STOP_REASONS_FOR_OUTCOME: Readonly<Record<RunOutcomeKindV2, readonly StopReason[]>> = {
  confirmed_finding: ANY_EXECUTED_STOP,
  error: ["error"],
  aborted: ["operator_abort"],
  not_reproduced: ["natural", "first_violation", "max_actions", "max_wall_seconds"],
  budget_exhausted: ["max_actions", "max_wall_seconds"],
  candidate_only: ["natural", "first_violation"],
  no_finding: ["natural"],
  not_run: ["not_run"],
};

export const RunRecordV2Schema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    contractVersion: ContractVersion,
    comparisonId: Id,
    runId: Id,
    arm: BenchmarkArmSchema,
    target: BenchmarkTargetSchema,
    explorerSeed: Seed,
    settingsKey: z.string().min(1),
    provenance: ProvenanceModeSchema,
    outcome: RunOutcomeKindV2Schema,
    stopReason: StopReasonSchema,
    notRunReason: z.string().min(1).max(500).optional(),
    errorMessage: z.string().min(1).max(500).optional(),
    actionsTaken: z.number().int().nonnegative(),
    wallSeconds: z.number().nonnegative().finite(),
    costUsd: z.number().nonnegative().finite(),
    /** Distinct tools the arm actually called, including rejected calls. */
    toolsUsed: z.array(ExplorerToolNameSchema),
    findings: z.array(RunFindingSchema),
    finalStateHash: StateHashSchema.optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    const has = (s: string) => r.findings.some((f) => f.status === s);
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (has("confirmed") !== (r.outcome === "confirmed_finding"))
      issue("confirmed_finding if and only if a finding is confirmed");
    if (r.outcome === "not_reproduced" && !has("not_reproduced") && !has("inconclusive"))
      issue("not_reproduced needs a not_reproduced or inconclusive finding");
    if (r.outcome === "candidate_only" && !has("candidate"))
      issue("candidate_only needs a candidate finding");
    if (r.outcome === "no_finding" && r.findings.length > 0)
      issue("no_finding cannot carry findings");
    const allowed = STOP_REASONS_FOR_OUTCOME[r.outcome];
    if (!allowed.includes(r.stopReason))
      issue(`outcome ${r.outcome} needs stopReason in [${allowed.join(", ")}]`);
    if (r.outcome === "error" && !r.errorMessage) issue("error needs errorMessage");
    if (r.outcome === "not_run") {
      if (!r.notRunReason) issue("not_run needs notRunReason");
      if (r.actionsTaken > 0 || r.findings.length > 0 || r.toolsUsed.length > 0 || r.costUsd > 0)
        issue("not_run cannot carry actions, tools, findings or spend");
    }
    if (new Set(r.toolsUsed).size !== r.toolsUsed.length) issue("toolsUsed must be distinct");
  });
export type RunRecordV2 = z.infer<typeof RunRecordV2Schema>;

export const ComparisonReportV2Schema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    contractVersion: ContractVersion,
    plan: ComparisonPlanSchema,
    runs: z.array(RunRecordV2Schema),
  })
  .strict();
export type ComparisonReportV2 = z.infer<typeof ComparisonReportV2Schema>;

export type ComparisonValidationV2 = {
  /** Any issue blocks arm-vs-arm numbers. */
  issues: ComparisonIssue[];
  /** Shown next to the numbers; do not block. */
  warnings: ComparisonIssue[];
};

export function validateComparisonV2(report: ComparisonReportV2): ComparisonValidationV2 {
  const issues: ComparisonIssue[] = [];
  const warnings: ComparisonIssue[] = [];
  const { plan, runs } = report;
  const key = comparableSettingsKey(plan.settings);
  const allowedTools = new Set(plan.settings.toolAccess);
  const armConfigs = new Set(plan.arms.map((a) => a.arm));

  if (!plan.targets.some((t) => t.fixtureMode === "faulty"))
    issues.push({ code: "no_faulty_target", message: "plan needs a faulty target" });
  if (!plan.targets.some((t) => t.fixtureMode === "fixed"))
    issues.push({ code: "no_clean_control", message: "plan needs a fixed (clean) target" });

  const matrix = new Set<string>();
  for (const a of plan.arms)
    for (const t of plan.targets)
      for (const s of plan.explorerSeeds) matrix.add(`${a.arm}|${t.targetId}|${s}`);
  const filled = new Set<string>();
  const planned = new Map<string, PlannedRun>();
  for (const p of plan.plannedRuns) {
    const cell = `${p.arm}|${p.target.targetId}|${p.explorerSeed}`;
    if (!matrix.has(cell))
      issues.push({ code: "unplanned_cell", message: `planned run outside matrix: ${cell}`, runId: p.runId });
    else if (filled.has(cell))
      issues.push({ code: "duplicate_planned_cell", message: `cell planned twice: ${cell}`, runId: p.runId });
    filled.add(cell);
    if (planned.has(p.runId))
      issues.push({ code: "duplicate_planned_run", message: "duplicate runId", runId: p.runId });
    planned.set(p.runId, p);
  }
  for (const cell of matrix)
    if (!filled.has(cell)) issues.push({ code: "matrix_gap", message: `matrix cell has no planned run: ${cell}` });

  const seen = new Set<string>();
  for (const r of runs) {
    const p = planned.get(r.runId);
    if (!p) {
      issues.push({ code: "unplanned_run", message: "run not in plan", runId: r.runId });
      continue;
    }
    if (seen.has(r.runId)) issues.push({ code: "duplicate_run", message: "run recorded twice", runId: r.runId });
    seen.add(r.runId);
    const push = (code: string, message: string) => issues.push({ code, message, runId: r.runId });
    if (r.comparisonId !== plan.comparisonId) push("wrong_comparison", "comparisonId mismatch");
    if (
      r.arm !== p.arm ||
      r.explorerSeed !== p.explorerSeed ||
      r.target.targetId !== p.target.targetId ||
      r.target.buildId !== p.target.buildId ||
      r.target.fixtureMode !== p.target.fixtureMode
    )
      push("run_plan_mismatch", "arm/seed/target differ from plan");
    if (r.settingsKey !== key) push("settings_mismatch", "run used different settings");
    if (!armConfigs.has(r.arm)) push("unknown_arm", "arm has no config");
    if (r.actionsTaken > plan.settings.maxActions) push("over_budget", "actionsTaken exceeds maxActions");
    if (r.costUsd > plan.settings.spendCapUsd) push("over_spend", "costUsd exceeds spendCapUsd");
    const outside = r.toolsUsed.filter((t) => !allowedTools.has(t));
    if (outside.length) push("tool_outside_access", `tools not in toolAccess: ${outside.join(", ")}`);
    const executed = r.outcome !== "not_run";
    if (OFFLINE_ARMS.includes(r.arm) && executed && r.provenance === "live")
      push("offline_arm_live", "offline arm cannot be live");
    if (!OFFLINE_ARMS.includes(r.arm) && executed && r.provenance !== "live")
      push("llm_arm_not_live", "LLM arm result must be live provenance");
    if (r.stopReason === "max_wall_seconds")
      warnings.push({
        code: "wall_time_cutoff",
        message: "stopped by maxWallSeconds; machine-dependent, compare only the completed prefix",
        runId: r.runId,
      });
  }
  for (const id of planned.keys())
    if (!seen.has(id))
      issues.push({ code: "missing_run", message: "planned run has no record (record not_run instead)", runId: id });

  return { issues, warnings };
}

export type ArmSummaryV2 = {
  arm: BenchmarkArm;
  planned: number;
  executed: number;
  notRun: number;
  faultyRuns: number;
  faultyConfirmed: number;
  faultyNotReproduced: number;
  cleanRuns: number;
  cleanFalseConfirmations: number;
  cleanNotReproduced: number;
  errors: number;
  aborted: number;
  wallTimeCutoffs: number;
  distinctInvariants: number;
  /** Count of actions (firstActionIndex + 1) up to the first confirmed finding. */
  medianActionsToFirstConfirmed: number | null;
  totalCostUsd: number;
  totalWallSeconds: number;
  /** False for every arm while validateComparisonV2 reports any issue. */
  comparable: boolean;
};

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function summarizeArmsV2(report: ComparisonReportV2): ArmSummaryV2[] {
  const valid = validateComparisonV2(report).issues.length === 0;
  const mode = new Map(report.plan.targets.map((t) => [t.targetId, t.fixtureMode]));
  return report.plan.arms.map(({ arm }) => {
    const rs = report.runs.filter((r) => r.arm === arm);
    const planned = report.plan.plannedRuns.filter((p) => p.arm === arm).length;
    const executed = rs.filter((r) => r.outcome !== "not_run");
    const faulty = executed.filter((r) => mode.get(r.target.targetId) === "faulty");
    const clean = executed.filter((r) => mode.get(r.target.targetId) === "fixed");
    const confirmedIn = (r: RunRecordV2) => r.findings.filter((f) => f.status === "confirmed");
    return {
      arm,
      planned,
      executed: executed.length,
      notRun: rs.length - executed.length,
      faultyRuns: faulty.length,
      faultyConfirmed: faulty.filter((r) => r.outcome === "confirmed_finding").length,
      faultyNotReproduced: faulty.filter((r) => r.outcome === "not_reproduced").length,
      cleanRuns: clean.length,
      cleanFalseConfirmations: clean.filter((r) => r.outcome === "confirmed_finding").length,
      cleanNotReproduced: clean.filter((r) => r.outcome === "not_reproduced").length,
      errors: executed.filter((r) => r.outcome === "error").length,
      aborted: executed.filter((r) => r.outcome === "aborted").length,
      wallTimeCutoffs: executed.filter((r) => r.stopReason === "max_wall_seconds").length,
      distinctInvariants: new Set(faulty.flatMap((r) => confirmedIn(r).map((f) => f.invariantId))).size,
      medianActionsToFirstConfirmed: median(
        faulty
          .map((r) => Math.min(...confirmedIn(r).map((f) => f.firstActionIndex + 1)))
          .filter(Number.isFinite),
      ),
      totalCostUsd: executed.reduce((n, r) => n + r.costUsd, 0),
      totalWallSeconds: executed.reduce((n, r) => n + r.wallSeconds, 0),
      comparable: valid && planned > 0 && executed.length === planned,
    };
  });
}
