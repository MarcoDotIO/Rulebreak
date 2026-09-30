import { z } from "zod";
import { ExplorerToolNameSchema } from "./mcp.js";
import { InvariantIdSchema } from "./rules.js";
import { FindingStatusSchema, TargetFixtureModeSchema } from "./records.js";
import { FindingIdSchema, SchemaVersionSchema, StateHashSchema } from "./primitives.js";

/**
 * RB-015 seeded baseline and honest comparison (AGENTS.md §14 "Compare exploration honestly").
 * Shared building blocks (arms, targets, comparable settings, plan, run finding, issue) used by
 * contract v2 in benchmark-v2.ts. The v1 run record, report, validator and summary were removed
 * after the runner moved to v2 (#63). Semantics: docs/contracts/rb-015-baseline.md.
 */

const Id = z.string().min(1).max(128);
const Seed = z.string().min(1).max(128);

/**
 * Tools a benchmark comparison may list in `toolAccess` / `toolsUsed`: the explorer (MCP) tools plus
 * `reward_claim`, which is a scripted-only benchmark action for the RB-016 reward pair. Adding it
 * here does not make it an explorer or MCP tool (`ExplorerToolNameSchema` is unchanged; that is
 * RB-018, parked), so only `scripted_known` can dispatch it.
 */
export const BenchmarkToolNameSchema = z.enum([...ExplorerToolNameSchema.options, "reward_claim"]);
export type BenchmarkToolName = z.infer<typeof BenchmarkToolNameSchema>;

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
    toolAccess: z.array(BenchmarkToolNameSchema).min(1),
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

export const RunFindingSchema = z
  .object({
    findingId: FindingIdSchema,
    status: FindingStatusSchema,
    invariantId: InvariantIdSchema,
    firstActionIndex: z.number().int().nonnegative(),
  })
  .strict();

export type ComparisonIssue = { code: string; message: string; runId?: string };
