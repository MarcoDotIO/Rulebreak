import { z } from "zod";
import { BoundedPositiveIntSchema, PlayerIdSchema, SchemaVersionSchema } from "./primitives.js";

/**
 * RB-016 reward extension (P1). The entitlement policy is the approved source of
 * truth for INV-006. It lives in contracts so the verifier never has to ask the
 * target how much a player may receive.
 */
export const RewardIdSchema = z.string().min(1).max(128);
export const RewardIdempotencyKeySchema = z.string().min(1).max(128);

export const RewardClaimParamsSchema = z
  .object({
    rewardId: RewardIdSchema,
    /** Target-defined game-level key. Explorers may reuse or vary it on purpose (AGENTS.md §6). */
    idempotencyKey: RewardIdempotencyKeySchema,
  })
  .strict();
export type RewardClaimParams = z.infer<typeof RewardClaimParamsSchema>;

export const RewardEntitlementSchema = z
  .object({
    rewardId: RewardIdSchema,
    /** Reward points granted per approved claim. */
    amount: BoundedPositiveIntSchema,
    maxClaimsPerPlayer: BoundedPositiveIntSchema,
    eligiblePlayers: z.array(PlayerIdSchema).min(1),
  })
  .strict();
export type RewardEntitlement = z.infer<typeof RewardEntitlementSchema>;

export const EntitlementPolicySchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    policyId: z.string().min(1).max(128),
    version: z.string().min(1).max(64),
    /**
     * v1 holds exactly one reward. Reward points are one pool per player, so with
     * several rewards a state check could only bound the pool total, not each reward.
     * Supporting more than one reward needs per-reward accounting in a later version.
     */
    rewards: z.array(RewardEntitlementSchema).length(1),
  })
  .strict();
export type EntitlementPolicy = z.infer<typeof EntitlementPolicySchema>;

export const REWARD_ENTITLEMENT_POLICY_V1: EntitlementPolicy = {
  schemaVersion: 1,
  policyId: "rulebreak-reward-entitlements-v1",
  version: "1.0.0",
  rewards: [
    {
      rewardId: "launch-bonus-001",
      amount: 10,
      maxClaimsPerPlayer: 1,
      eligiblePlayers: ["player-a", "player-b"],
    },
  ],
};

const POLICIES: Readonly<Record<string, EntitlementPolicy>> = {
  [REWARD_ENTITLEMENT_POLICY_V1.policyId]: REWARD_ENTITLEMENT_POLICY_V1,
};

/** Look up an approved policy by id. Unknown ids return undefined; callers must fail closed. */
export function approvedEntitlementPolicy(policyId: string): EntitlementPolicy | undefined {
  return POLICIES[policyId];
}

/** Most reward points a player may ever hold under the policy (no reward sinks in v1). */
export function entitlementCeiling(policy: EntitlementPolicy, playerId: string): number {
  return policy.rewards
    .filter((reward) => (reward.eligiblePlayers as readonly string[]).includes(playerId))
    .reduce((sum, reward) => sum + reward.amount * reward.maxClaimsPerPlayer, 0);
}
