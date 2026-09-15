import { z } from "zod";
import { SchemaVersionSchema } from "./primitives.js";

export const InvariantIdSchema = z.enum([
  "INV-001",
  "INV-002",
  "INV-003",
  "INV-004",
  "INV-005",
  "INV-006",
]);
export type InvariantId = z.infer<typeof InvariantIdSchema>;

export const P0_INVARIANTS = [
  "INV-001",
  "INV-002",
  "INV-003",
  "INV-004",
  "INV-005",
] as const satisfies readonly InvariantId[];

export const RulePackSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  rulePackId: z.string().min(1).max(128),
  version: z.string().min(1).max(64),
  invariantIds: z.array(InvariantIdSchema).min(1),
  description: z.string().max(2000).optional(),
});
export type RulePack = z.infer<typeof RulePackSchema>;

export const APPROVED_RULE_PACK_V1: RulePack = {
  schemaVersion: 1,
  rulePackId: "rulebreak-trade-v1",
  version: "1.0.0",
  invariantIds: [...P0_INVARIANTS],
  description:
    "P0 trade economy: nonnegative bounded ints; currency conserved on trades; unique item single location; trade lifecycle open→accepted|cancelled; atomic accept; no authorized mints.",
};

export const InvariantViolationSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  invariantId: InvariantIdSchema,
  logicalActionId: z.string().min(1).max(128),
  sequence: z.number().int().nonnegative(),
  message: z.string().min(1).max(1000),
  preStateHash: z.string().min(1).max(128),
  postStateHash: z.string().min(1).max(128),
});
export type InvariantViolation = z.infer<typeof InvariantViolationSchema>;
