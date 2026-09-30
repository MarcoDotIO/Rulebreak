import type { PlayerId } from "@rulebreak/contracts";

/** Same shape as the campaign runner's scripted step, widened to reward_claim. */
export type RewardScriptedStep = {
  actorId: PlayerId;
  kind: "trade_create" | "trade_accept" | "trade_cancel" | "reward_claim";
  params: Record<string, unknown>;
};

/**
 * RB-016 scripted double-claim. Steps 1 and 3 are legitimate single claims; step 2
 * reuses the same key (the fixed and faulty targets both refuse it); step 4 claims
 * the same reward under a new key, which only the faulty target grants.
 */
const DOUBLE_CLAIM_STEPS: RewardScriptedStep[] = [
  { actorId: "player-a", kind: "reward_claim", params: { rewardId: "launch-bonus-001", idempotencyKey: "claim-a-1" } },
  { actorId: "player-a", kind: "reward_claim", params: { rewardId: "launch-bonus-001", idempotencyKey: "claim-a-1" } },
  { actorId: "player-b", kind: "reward_claim", params: { rewardId: "launch-bonus-001", idempotencyKey: "claim-b-1" } },
  { actorId: "player-a", kind: "reward_claim", params: { rewardId: "launch-bonus-001", idempotencyKey: "claim-a-2" } },
];

export function knownRewardDoubleClaimSteps(): RewardScriptedStep[] {
  return DOUBLE_CLAIM_STEPS.map((step) => ({ ...step, params: { ...step.params } }));
}
