# RB-016 duplicate-reward fixture and `INV-006`

Status: proposed in this PR. Owner: Backend Architect Wizard (fixture, rule pack); Engineer Overlord (runner wiring, separate PR). Depends on RB-013.
Acceptance (BOARD, RB-016): a planted double-claim breaks `INV-006` against an independent entitlement policy, not the target's own claim counter; it replays offline; a regression test fails on the faulty target and passes on the fixed one, with legitimate claims still green; `INV-006` is in a new versioned rule pack, so `rulebreak-trade-v1` doesn't change.

This is an offline fixture. It costs $0 and adds no live or LLM path.

## 1. Rule pack and policy

- `rulebreak-reward-v1` (`APPROVED_RULE_PACK_REWARD_V1`, `packages/contracts/src/rules.ts`) is `INV-001`…`INV-005` plus `INV-006`, and names `entitlementPolicyId: "rulebreak-reward-entitlements-v1"`.
- `rulebreak-trade-v1` is unchanged. `RulePackSchema` gains only the optional `entitlementPolicyId`, which the trade pack doesn't set, so the RB-015 v2 settings key is unchanged.
- The policy (`REWARD_ENTITLEMENT_POLICY_V1`, `packages/contracts/src/rewards.ts`) has one reward, `launch-bonus-001`: 10 reward points, at most one claim per player, both players eligible.
- The verifier fails closed. A pack that enables `INV-006` without naming an approved policy throws instead of skipping the check.
- v1 allows exactly one reward in a policy. Reward points are one pool per player, so with several rewards the state check could only bound the total. More rewards need per-reward accounting in a later policy version.

## 2. World state

`WorldState` gains two optional fields. Trade-only worlds leave both out, so their state hashes are unchanged.

- `rewardPoints`: reward points per player. They are not currency and have no sinks in v1, so `INV-002` still means exact currency conservation.
- `rewardClaims`: the target's own claim ledger. `INV-006` never reads it.

## 3. `INV-006`

Both checks use only `rewardPoints` and the approved policy (`packages/verifier/src/predicates.ts`).

- **State:** each player's points are at most the policy ceiling (amount × max claims, summed over rewards the player is eligible for). It runs on the pre- and post-state of every transition.
- **Transition:** points change only on an accepted `reward_claim`, only for the claiming actor, only for a reward the policy names and the actor is eligible for, and by 0 up to that reward's amount.

## 4. Targets and the planted defect

`reward_claim` takes `{ rewardId, idempotencyKey }`. The key is a game-level key: explorers may reuse or vary it, and the bridge must not collapse submissions (AGENTS.md §6).

| Factory | Behavior |
| --- | --- |
| `createRewardTargetAdapter()` | Fixed. Refuses a second claim of the same reward by the same player (`ALREADY_CLAIMED`), whatever the key. |
| `createFaultyRewardFixtureTargetAdapter()` | Faulty, tests and replay only. Deduplicates on the key alone, so a new key grants again. Its ledger keeps one row per (player, reward), so its own counter still reads one claim. Trades behave as in the fixed target. |

The target's reward catalog (`REWARD_CATALOG_V1`, `packages/economy`) is defined separately from the policy on purpose. A test checks that they agree.

Trade-only targets reject `reward_claim` with `REWARDS_DISABLED` and no state change.

## 5. Scripted double-claim

`knownRewardDoubleClaimSteps()` (`packages/economy/src/reward-fixture.ts`) is four claims of `launch-bonus-001`:

1. A, key `claim-a-1`: granted on both targets.
2. A, key `claim-a-1` again: refused on both targets.
3. B, key `claim-b-1`: granted on both targets.
4. A, key `claim-a-2`: refused on the fixed target, and granted on the faulty one, which breaks `INV-006` at sequence 4.

The steps use the runner's scripted-step shape, widened to `reward_claim`. Tests: `tests/rewards/reward-fixture.test.ts` (offline driver, regression test, replay) and `tests/rewards/inv-006.test.ts` (hand-built snapshots only).

## 6. Left for the runner wiring

The runner and replay still pick targets by `fixed`/`faulty` and default to `rulebreak-trade-v1`. Wiring the reward pair means choosing the reward factories and passing `APPROVED_RULE_PACK_REWARD_V1` to `verifyTransition`, and widening `ScriptedStep["kind"]`. No `reward_claim` MCP tool is added here; the explorer tool list is unchanged.
