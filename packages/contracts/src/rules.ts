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
  /** Required when invariantIds includes INV-006; names an approved entitlement policy. */
  entitlementPolicyId: z.string().min(1).max(128).optional(),
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

/**
 * RB-016 reward pack. A separate pack so `rulebreak-trade-v1` (and every settings
 * key built on it) is unchanged. Reward points are a separate pool from currency,
 * so INV-002 still means exact currency conservation here.
 */
export const APPROVED_RULE_PACK_REWARD_V1: RulePack = {
  schemaVersion: 1,
  rulePackId: "rulebreak-reward-v1",
  version: "1.0.0",
  invariantIds: [...P0_INVARIANTS, "INV-006"],
  entitlementPolicyId: "rulebreak-reward-entitlements-v1",
  description:
    "rulebreak-trade-v1 plus INV-006: reward points granted to each player never exceed the approved entitlement policy, checked from balances and the policy, not the target's claim ledger.",
};
