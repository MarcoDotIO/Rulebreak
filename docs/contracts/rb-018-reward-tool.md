# RB-018 — offline `reward_claim` explorer action: tool-boundary contract

Status: contract and security-policy line (Backend Architect Wizard). Runner wiring follows (Engineer Overlord). Offline, $0.

Acceptance (BOARD, Titan): `seeded_random` can call `reward_claim` against the local reward fixture only, so the reward-pair comparison reports `seeded_random` as a measured arm on faulty and fixed instead of `not_run`. The tool stays off for live mode and the LLM arms, and the trade pair's settings key doesn't change.

## 1. Where the tool is allowed

`isExplorerToolAllowed(tool, { execution, targetFamily, arm })` in `packages/security-policy` is the only policy gate. `toolAccess` and `settingsProblem` still apply on top of it.

| Tool | Allowed when |
| --- | --- |
| P0 tools (`EXPLORER_ALLOWLIST_P0`) | always, same as `isExplorerToolAllowedP0` |
| `reward_claim` | `execution === "offline_fixture"`, `targetFamily === "reward"`, and `arm` is in `REWARD_CLAIM_OFFLINE_ARMS` (`scripted_known`, `seeded_random`) |
| anything else | never |

The following don't change:
- `ExplorerToolNameSchema`, which is the MCP tool list.
- `EXPLORER_ALLOWLIST_P0`.
- `isExplorerToolAllowedP0("reward_claim") === false`.
- `LIVE_DEFAULT_ENABLED === false`.

`reward_claim` remains a `BenchmarkToolName` only. No MCP tool is added, and live mode and the LLM arms keep refusing it. Changing that waits on Marco, like A.

## 2. What the wiring must do

1. **Gate before dispatch.** Call `isExplorerToolAllowed` together with the existing `toolAccess` check. The offline benchmark passes `execution: "offline_fixture"`. A refusal is handled like any other §9.3 refusal: it isn't counted as an action, it isn't added to `toolsUsed`, and it is named in `errorMessage`. With this gate in place, the `seeded_random` "unreachable" throw can go.
2. **`notRunReasonFor`.** On the reward pair, `seeded_random` runs. `llm_single` and `llm_dual` stay `not_run` because the live gate is closed, with no metrics and no zeros.
3. **Arguments.** Parse them exactly as RB-016 does: reject authority fields first, then apply `RewardClaimParamsSchema` (`{rewardId, idempotencyKey}`), which is strict. The acting account is the runner's bound `actorId`. The generator picks which bound player acts on each step, and any actor field in the arguments is rejected as an authority field.
4. **Generator.** Add a new `generatorId` for the reward pair, for example `rb018-seeded-random-reward-v1`. `mulberry32-fnv1a32-v1` stays with trade. The generator draws:
   - `rewardId` from `REWARD_CATALOG_V1`, plus at most one fixed unknown id so the refusal path is exercised;
   - `idempotencyKey` from a small fixed pool for each actor, so that the same key, a new key and a cross-actor key all come up;
   - `actorId` from the fixture's bound players.
   
   The generator can't see the verifier state or the target's claim ledger, and it has no reset or fixture selection.
5. **Comparison.** The trade pair's settings key and `bench:rb015` output stay byte-identical apart from wall time and the commit, and a test pins this.
   - The reward pair gets a new comparison id, `rb-018-reward-offline-v1`, so it doesn't change the published RB-016 `rb-016-reward-offline-v1` artifact.
   - `seeded_random` uses real independent seeds, 5 of them.
   - `scripted_known` stays 1 seed and keeps the wording "by construction".
   - If the plan sets seeds for every arm at once, `scripted_known` may run at 5, but it is labelled as 5 repeats of one script and is never counted as "5 of 5".
6. **Reporting.** `seeded_random` findings are measured results on one synthetic fixture pair. Report them as "k of n seeds confirmed `INV-006` on faulty; m of n on fixed", never as a general detection rate. `comparable` applies only within `rb-018-reward-offline-v1`.
   - If `seeded_random` finds 0 on fixed, that 0 comes from how the fixture is built and isn't a measured result, the same as RB-015.

Caps are unchanged: G4 is Not run, M13 is Partial, the LLM arms are `not_run`, and paid spend is $0.

## 3. Tests the wiring adds

- A `seeded_random` run on the reward pair dispatches `reward_claim`, and replay reproduces its findings.
- The same arm on the trade pair never dispatches `reward_claim`, and `settingsProblem` still refuses it in trade `toolAccess`.
- Calling `isExplorerToolAllowed` with `execution: "live"`, or with an LLM arm, refuses `reward_claim` before dispatch.
- The existing pin on the trade settings key still passes.

This PR adds the policy matrix tests in `tests/security/rb-018-reward-claim-boundary.test.ts`.
