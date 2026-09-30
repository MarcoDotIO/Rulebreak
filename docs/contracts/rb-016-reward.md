# RB-016 duplicate-reward fixture and `INV-006`

Status: merged in #68; runner wiring (§7) in #71. Owner: Backend Architect Wizard (fixture, rule pack); Engineer Overlord (runner wiring, separate PR). Depends on RB-013.
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

Both checks read `rewardPoints` and the approved policy; the transition check also reads the envelope (`kind`, `actorId`, `rewardId`) and the result's `outcome` (`packages/verifier/src/predicates.ts`). Neither reads `rewardClaims`.

- **State:** each player's points are at most the policy ceiling (amount × max claims, summed over rewards the player is eligible for). It runs on the pre- and post-state of every transition.
- **Transition:** points change only on an accepted `reward_claim`, only for the claiming actor, only for a reward the policy names and the actor is eligible for, and by at least 0 and at most that reward's amount. A decrease is a failure, since v1 has no reward sinks.

## 4. Targets and the planted defect

`reward_claim` takes `{ rewardId, idempotencyKey }`. The key is a game-level key: explorers may reuse or vary it, and the bridge must not collapse submissions (AGENTS.md §6).

| Factory | Behavior |
| --- | --- |
| `createRewardTargetAdapter()` | Fixed. Refuses a second claim of the same reward by the same player (`ALREADY_CLAIMED`), whatever the key. |
| `createFaultyRewardFixtureTargetAdapter()` | Faulty, tests and replay only. Deduplicates on the key alone, so a new key grants again. Its ledger keeps one row per (player, reward), so its own counter still reads one claim. Trades behave as in the fixed target. Its counter reads one claim whatever the key sequence: keys k1, k2, k1 give 30 points against one ledger row. |

The fixed target ignores the key and counts claims per (player, reward). That is enough at a limit of 1. A policy version with a limit above 1 must also require the fixed target to deduplicate by key, so a repeated key cannot use up a second claim.

The target's reward catalog (`REWARD_CATALOG_V1`, `packages/economy`) is defined separately from the policy on purpose. A test checks that they agree.

Trade-only targets reject `reward_claim` with `REWARDS_DISABLED` and no state change.

## 5. Scripted double-claim

`knownRewardDoubleClaimSteps()` (`packages/economy/src/reward-fixture.ts`) is four claims of `launch-bonus-001`:

1. A, key `claim-a-1`: granted on both targets.
2. A, key `claim-a-1` again: refused on both targets.
3. B, key `claim-b-1`: granted on both targets.
4. A, key `claim-a-2`: refused on the fixed target, and granted on the faulty one, which breaks `INV-006` at sequence 4.

These steps were written to hit `INV-006@4`, knowing the planted defect. They show that the verifier catches the defect and that the run replays; they are not evidence that an explorer finds it.

The steps use the runner's scripted-step shape, widened to `reward_claim`. Tests: `tests/rewards/reward-fixture.test.ts` (offline driver, regression test, replay) and `tests/rewards/inv-006.test.ts` (hand-built snapshots only).

## 6. Left for the runner wiring

The runner and replay still pick targets by `fixed`/`faulty` and default to `rulebreak-trade-v1`. Wiring the reward pair means choosing the reward factories and passing `APPROVED_RULE_PACK_REWARD_V1` to `verifyTransition`, and widening `ScriptedStep["kind"]`. No `reward_claim` MCP tool is added here; the explorer tool list is unchanged. The wiring runs `scripted_known` only on the reward pair and records the other arms as `not_run` ("no reward_claim tool"), as a new comparison. An offline, fixture-only explorer action is parked as RB-018.

## 7. Runner wiring and offline reward-pair run

Owner: Engineer Overlord. Code: `packages/campaign/src/scripted-runner.ts`, `packages/replay/src/replay.ts`, `packages/campaign/src/benchmark-runner.ts` (`buildRewardOfflinePlan`), `scripts/bench-rb015.ts` (`--reward-pair`). Tests: `tests/benchmark/rb-016-reward-runner.test.ts`.

```bash
source ~/.nvm/nvm.sh && nvm use 26.5.0
npm run bench:rb016      # = bench-rb015.ts --reward-pair -> artifacts/rb-016/rb-016-reward-offline-v1.{sqlite,report.json,...}
```

What the wiring does:

- **Target family.** `ScriptedCampaignRunner` and `replayBundle` take `targetFamily` (`"trade"` by default, or `"reward"`) and an optional `rulePack` (default: the family's pack). The reward family builds `createRewardTargetAdapter()` / `createFaultyRewardFixtureTargetAdapter()`, verifies with `rulebreak-reward-v1`, and labels rows `synthetic-reward-fixed` / `synthetic-reward-faulty`. Campaign rows record `rulePackId: "rulebreak-reward-v1"`; finding rows record the pack's `rulePackVersion` (the `Finding` schema has no `rulePackId`). `ScriptedStep["kind"]` now includes `reward_claim`.
- **Replay.** Same-build confirmation on the faulty reward build returns `matched_violation` when `INV-006` reproduces. The fixed-control path on the reward pair checks that the claim which broke `INV-006` (matched by `logicalActionId`) is refused; the trade path still checks the `trade_cancel` step.
- **Benchmark runner.** The family comes from `settings.rulePackId`. On the reward pair only `scripted_known` runs, with `knownRewardDoubleClaimSteps()`. `seeded_random`, `llm_single` and `llm_dual` are recorded as `not_run` with a reason starting "no reward_claim tool" (RB-018, parked). No explorer or MCP tool was added: `ExplorerToolNameSchema` is unchanged. The benchmark contract's `toolAccess` / `toolsUsed` now accept `BenchmarkToolNameSchema` (explorer tools plus the scripted-only `reward_claim`), and a trade plan that lists `reward_claim` ends every offline run as a settings error.
- **Trade path unchanged.** With the defaults, the trade targets, labels, rule pack, replay messages and settings key are the same as before. `bench:rb015` at code commit `ac2802d` gives the same report, traces and summary as main (`87160e5`; `bac1ba2` changed only docs), apart from `wallSeconds` and the commit stamp, and the same store rows apart from timestamps.

Run (`docs/spikes/rb-016-reward-report*.json`, code commit `ac2802dcd922cbe364b5b8be7294eec2bf52a6a6`, 2026-09-29, macOS, Node 26.5.0). Comparison `rb-016-reward-offline-v1`: 4 arms × `synthetic-reward-faulty` + `synthetic-reward-fixed` × 1 seed (`rb016-seed-01`), so 8 planned runs, `maxActions` 200, `maxWallSeconds` 60, $0 cap. It uses one seed because `scripted_known` is the only arm that runs and plays the same four steps whatever the seed. Its settings key (rule pack `rulebreak-reward-v1`, reset `rb016-fresh-reward-adapter-initialize-v1`, `initialStateHash` `9288d76f…`, `toolAccess` with `reward_claim`) differs from the RB-015 trade key, so this is a new comparison, not a rerun. `validateComparisonV2`: 0 issues, 0 warnings.

Result: the scripted run confirmed `INV-006`, by construction.

| arm | executed / planned | result |
| --- | --- | --- |
| `scripted_known` | 2 / 2 | faulty (1 run): `confirmed_finding`/`first_violation`, `INV-006` at action 4, confirmed through replay. fixed (1 run): `no_finding`/`natural`; 2 claims granted (A and B), the duplicate key and the new-key re-claim refused. $0. |
| `seeded_random` | 0 / 2 | `not_run`: no `reward_claim` tool. No metrics. |
| `llm_single` | 0 / 2 | `not_run`: no `reward_claim` tool; live gate not approved. No metrics. |
| `llm_dual` | 0 / 2 | `not_run`: no `reward_claim` tool; live gate not approved. No metrics. |

`comparable`: `comparable: true` on `scripted_known` means its runs are complete within `rb-016-reward-offline-v1` only. It is not comparable with RB-015 or any other comparison, nor with the `not_run` arms here, which have no result. The same note is in the report's plan (`heldBackVariations`) and in `.summary.json` (`comparableNote`).

Honesty caps:

- `scripted_known` was hand-written to hit `INV-006` at action 4: the scripted run confirmed `INV-006`, by construction. It is not explorer-discovered and not a detection rate. The plan uses one seed because every seed would run the same four steps.
- The 0 false confirmations on fixed come from how the fixture is built: `synthetic-reward-fixed` refuses a second claim of the same reward by the same player. It is not measured.
- The `not_run` arms have no result, not a zero result. The CLI summary gives them a `not_run` stub with no metrics.
- Offline only, synthetic fixture with one planted defect. Paid spend $0. LLM arms `not_run`. Thor-over-SSH runs are not `llm_dual` results. G4: Not run. The pitch is not closed. Not evidence of general exploit-detection performance.
