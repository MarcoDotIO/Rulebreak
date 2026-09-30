# RB-018 — offline `reward_claim` explorer action: tool-boundary contract

Status: contract and security-policy line (Backend Architect Wizard); runner wiring and the first offline results (Engineer Overlord, §4). Offline, $0.

Acceptance (BOARD, Titan): `seeded_random` can call `reward_claim` against the local reward fixture only, so the reward-pair comparison reports `seeded_random` as a measured arm on faulty and fixed instead of `not_run`. The tool stays off for live mode and the LLM arms, and the trade pair's settings key doesn't change.

## 1. Where the tool is allowed

`isExplorerToolAllowed(tool, { execution, targetFamily, arm })` in `packages/security-policy` is the only policy gate. `toolAccess` and `settingsProblem` still apply on top of it.

| Tool | Allowed when |
| --- | --- |
| P0 tools (`EXPLORER_ALLOWLIST_P0`) | always, same as `isExplorerToolAllowedP0`. The gate adds no restriction on P0 tools, in any context. |
| `reward_claim` | `execution === "offline_fixture"`, `targetFamily === "reward"`, and `arm` is in `REWARD_CLAIM_OFFLINE_ARMS` (`scripted_known`, `seeded_random`) |
| anything else | never |

A null or undefined context refuses `reward_claim` (it returns false instead of throwing).

The following don't change:
- `ExplorerToolNameSchema`, which is the MCP tool list.
- `EXPLORER_ALLOWLIST_P0`.
- `isExplorerToolAllowedP0("reward_claim") === false`.
- `LIVE_DEFAULT_ENABLED === false`.

`reward_claim` remains a `BenchmarkToolName` only. No MCP tool is added, and live mode and the LLM arms keep refusing it. Adding `reward_claim` to the MCP tool list, or allowing it in live mode or for an LLM arm, needs Marco's explicit approval first, the same way the live gate does.

## 2. What the wiring must do

1. **Gate before dispatch.** The gate sits in the benchmark runner (`packages/campaign/src/benchmark-runner.ts`), in the action loop right after the existing `allowed.has(call.tool)` check against `toolAccess`, and before the call is counted or dispatched. The offline benchmark passes `execution: "offline_fixture"`, the plan's target family and the run's arm. A refusal is handled like any other refusal under RB-015 contract §9.3: it isn't counted as an action, it isn't added to `toolsUsed`, it is named in `errorMessage`, and it ends the run with outcome `error` (stop reason `error`, no replay).
   - The old "unreachable" throw lived somewhere else: in the `reward_claim` case of the seeded_random explorer's generation switch (`seededRandomExplorer`). That case now generates real `reward_claim` arguments (point 4) instead of throwing.
   - The campaign package now depends on `@rulebreak/security-policy` (a workspace dependency, added to `packages/campaign/package.json` and the lockfile). `@rulebreak/security-policy` imports nothing from other workspace packages, so there is no import cycle.
2. **`notRunReasonFor` is keyed on `generatorId`.** On the reward pair, a `seeded_random` run executes only when its arm's `generatorId` is the RB-018 reward generator (`rb018-seeded-random-reward-v1`). Any other generator stays `not_run` with the RB-016 reason. That includes the trade generator `mulberry32-fnv1a32-v1`, which the published RB-016 plan uses, so `bench:rb016` and its artifacts do not change. `llm_single` and `llm_dual` stay `not_run` because the live gate is closed, with no metrics and no zeros. On the trade pair, the reward generator is refused as an unknown generator (the run ends as `error`).
3. **Arguments.** Parse them exactly as RB-016 does: reject authority fields first, then apply `RewardClaimParamsSchema` (`{rewardId, idempotencyKey}`), which is strict. The acting account is the runner's bound `actorId`. The generator picks which bound player acts on each step, and any actor field in the arguments is rejected as an authority field.
4. **Generator.** The reward pair's `generatorId` is `rb018-seeded-random-reward-v1`. `mulberry32-fnv1a32-v1` stays with trade, and its choices are unchanged (it never reaches the `reward_claim` case, because `reward_claim` is only in the reward pair's `toolAccess`). Like the trade generator, it picks each step's tool uniformly from the settings' `toolAccess`, so it also makes trade and observe calls. For `reward_claim` it draws:
   - `rewardId` from the target's own `REWARD_CATALOG_V1`, plus one fixed unknown id (`reward-unknown-rb018`) so the refusal path is exercised;
   - `idempotencyKey` from a small fixed pool for each actor (two of the actor's own keys and one of the other player's), so that the same key, a new key and a cross-actor key all come up;
   - `actorId` from the fixture's bound players.
   
   The generator can't see the verifier state or the target's claim ledger, and it has no reset or fixture selection.
5. **Comparison and seeds.** The trade pair's settings key and `bench:rb015` output stay byte-identical apart from wall time and the commit, and tests pin this (`tests/benchmark/rb-018-reward-runner.test.ts` compares both published reports with a fresh run).
   - The reward pair gets a new comparison id, `rb-018-reward-offline-v1`, so it doesn't change the published RB-016 `rb-016-reward-offline-v1` artifact.
   - `rb-018-reward-offline-v1` shares the reward settings key with `rb-016-reward-offline-v1`. The settings (and so the key) exclude the comparison id, the arms and the `generatorId`, and both comparisons use the same reward settings. Sharing a key does not make the two comparisons comparable: `comparable` applies only within `rb-018-reward-offline-v1` (point 6).
   - **Seeds (decision).** Seeds are set for the whole plan: `ComparisonPlanSchema` has one plan-wide `explorerSeeds` list, and `validateComparisonV2` expects every arm × target × seed cell, so per-arm seeds would fail validation. RB-018 therefore uses 5 plan-wide seeds (`rb018-seed-01` … `rb018-seed-05`).
     - `seeded_random` runs 5 independent seeds on faulty and on fixed.
     - `scripted_known` runs at the same 5 seeds. It plays the same four hand-written steps whatever the seed, so its runs are labelled everywhere as "5 repeats of one deterministic script, not 5 independent samples". Its count of confirmed repeats is never reported as independent results. It keeps the wording "by construction".
6. **Reporting.** `seeded_random` findings are measured results on one synthetic fixture pair. Report them as "INV-006 confirmed on faulty for k seeds out of n; on fixed for m seeds out of n", never as a general detection rate. `comparable` applies only within `rb-018-reward-offline-v1`.
   - If `seeded_random` finds 0 on fixed, that 0 comes from how the fixture is built and isn't a measured result, the same as RB-015.

Caps: offline only; paid spend $0; the LLM arms are `not_run`; Thor-over-SSH runs are not `llm_dual` results; G4 is Not run; M13 is Partial; the pitch is not closed; and none of this is evidence of general exploit-detection performance.

## 3. Tests the wiring adds

- A `seeded_random` run on the reward pair dispatches `reward_claim`, and replay reproduces its findings.
- The same arm on the trade pair never dispatches `reward_claim`, and `settingsProblem` still refuses it in trade `toolAccess`.
- Calling `isExplorerToolAllowed` with `execution: "live"`, or with an LLM arm, refuses `reward_claim` before dispatch.
- The existing pin on the trade settings key still passes.

The policy matrix tests are in `tests/security/rb-018-reward-claim-boundary.test.ts`: every benchmark tool in all 16 contexts (2 execution modes × 2 target families × 4 arms), plus a null or undefined context. The runner tests are in `tests/benchmark/rb-018-reward-runner.test.ts`. The gate-refusal runner test sets the `gateExecution` test hook to `live`; production never sets it.

## 4. Results (offline, $0)

`npm run bench:rb018`: comparison `rb-018-reward-offline-v1`, 40 planned runs (4 arms × 2 targets × 5 seeds), `validateComparisonV2` clean (0 issues, 0 warnings). Snapshot: `docs/spikes/rb-018-reward-report.json`, with `.summary.json` and `.traces.json`.

| Arm | synthetic-reward-faulty | synthetic-reward-fixed |
| --- | --- | --- |
| `seeded_random` (`rb018-seeded-random-reward-v1`, 5 independent seeds) | INV-006 confirmed for 5 seeds out of 5 (first violation at actions 37, 108, 32, 18 and 35; median 35) | confirmed for 0 seeds out of 5 (every run used its full 200-action budget) |
| `scripted_known` (5 repeats of one deterministic script, not 5 independent samples) | the script confirmed INV-006 at action 4 in every repeat, by construction | no finding in any repeat |
| `llm_single`, `llm_dual` | `not_run`, no result | `not_run`, no result |

- Every `seeded_random` confirmation on faulty came from replaying the stored trace on the faulty build.
- The 0 on fixed comes from how the fixture is built and is not a measured result: the fixed target refuses a second claim of the same reward by the same player.
- These are counts of seeds on one synthetic fixture pair with one planted defect. They are not a detection rate and say nothing about other targets.
- `bench:rb016` and `bench:rb015` output, reports and store rows are unchanged apart from wall time, the commit stamp and timestamps.
