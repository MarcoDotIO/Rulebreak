# Rulebreak evaluation evidence

Owner: Mnemosyne Archivist. This page indexes benchmark evidence. It does not copy result numbers. The contract sections linked below are the only source for them, so the numbers exist in one place.

The label conventions follow `AGENTS.md`: live, scripted, mocked or recorded. **Verified** means a result was reproduced and reviewed on the linked commit. **Not verified** means it was reported but not independently re-run.

## RB-015 seeded baseline (offline, $0)

Contract and results: [`docs/contracts/rb-015-baseline.md`](contracts/rb-015-baseline.md).

| Version | Contract | Runner | Code commit of the run | Results | Snapshot |
| --- | --- | --- | --- | --- | --- |
| v1 (historical) | #56 | #58 (main `047715a`) | `72f47af` | §8 | `docs/spikes/rb-015-offline-report*.json` |
| v2 (current) | #60 (main `47c8312`) | #63 (main `3e7123e`) | `3d5dd61` | §10 | `docs/spikes/rb-015-v2-offline-report*.json` |

The v1-only contract exports and tests were removed in #65 (main `f8427a6`). The v1 row above is history: its §8 results and snapshot are kept but can no longer be regenerated from current code. The contract's §9 is in force.

What the v2 run shows:

- The default plan has 2 offline arms (`scripted_known`, `seeded_random`), each run on the faulty and the fixed synthetic trade target with 5 seeds, for 20 runs in total. `validateComparisonV2` found no issues and no warnings, and both arms are `comparable` with a full budget.
- Both arms confirmed the planted defect (INV-003) on every faulty run. Neither arm confirmed anything on the clean (fixed) target.
- The v2 action sequences and outcomes are identical to v1. Only the new v2 fields (`stopReason`, `toolsUsed`) and the wall times differ.
- Plans and run records are stored in the insert-only `benchmark_comparisons` and `benchmark_runs` tables in `EvidenceStore` (§9.5). The report JSON is exported from those tables.

Review status:

- **Reviewed:** the contract and runner wording (Archivist), the boundary review (Wizard), the engineering review (EO), and the merge call (Chronomancer). Each is linked from its PR.
- **Not verified by Archivist:** the test counts, the typecheck result and the benchmark numbers. They come from the EO and Wizard runs recorded on #63 and #65, and Archivist has not re-run them.

Honesty caps, which apply to every RB-015 number:

- The runs are offline only, on the in-repo synthetic fixture with one planted defect. Paid spend is $0, and there are no LLM, network or Thor calls.
- `llm_single` and `llm_dual` are `not_run` because the live gate is not approved. They are not zero-finding results, and no claim is made comparing an arm against an LLM. Consumers must check `outcome` before `provenance`.
- Thor-over-SSH runs are not `llm_dual` results.
- The zeros on the clean target (false confirmations, candidates and `not_reproduced`) are **guaranteed by how the fixture is built, not measured**.
- `scripted_known` was written to hit this exact defect, so its faulty-target rate is expected by construction.
- `totalWallSeconds` depends on the machine.
- G4 is Not run, and the pitch is not closed. This is **not** evidence of general exploit-detection performance.

## RB-016 reward pair (offline, $0)

Contract and results: [`docs/contracts/rb-016-reward.md`](contracts/rb-016-reward.md) §7.

| Comparison | Fixture | Runner | Code commit of the run | Results | Snapshot |
| --- | --- | --- | --- | --- | --- |
| `rb-016-reward-offline-v1` | #68 (main `87160e5`) | #71 (main `ba768e2`) | `ac2802d` | §7 | `docs/spikes/rb-016-reward-report*.json` |

This is a separate comparison with its own settings key (rule pack `rulebreak-reward-v1`). It is not a rerun of RB-015 v2, and its results are not comparable with RB-015.

What the run shows:

- Only `scripted_known` runs, on the faulty and the fixed synthetic reward target with 1 seed. `validateComparisonV2` found no issues and no warnings.
- The scripted run confirmed `INV-006`, by construction. The fixed target produced no finding, with legitimate claims still granted.
- `seeded_random`, `llm_single` and `llm_dual` are `not_run` because no explorer has a `reward_claim` tool yet (RB-018). They have no result, which is not a zero result.
- `comparable` on `scripted_known` means complete within `rb-016-reward-offline-v1` only.

Review status:

- **Reviewed:** the §7 wording (Archivist), the boundary review (Wizard), product acceptance (Titan), and the merge call (Chronomancer), all on #71 at `beb0e0b`.
- **Not verified by Archivist:** the test counts, the typecheck result and the run numbers. They come from the EO and Wizard runs recorded on #71, and Archivist has not re-run them.

Honesty caps, which apply to every RB-016 number:

- `scripted_known` was hand-written to hit `INV-006` at action 4. It is not explorer-discovered and not a detection rate.
- The 0 false confirmations on the fixed target are guaranteed by how the fixture is built, not measured.
- Offline only, synthetic fixture with one planted defect, paid spend $0. Thor-over-SSH runs are not `llm_dual` results. G4 is Not run, and the pitch is not closed. Not evidence of general exploit-detection performance.

Out of scope until later work: a measured `seeded_random` arm on the reward pair, which is now RB-018 (separate comparison, below); reduced-trace length, which waits on RB-017; and any batch live (LLM) evaluation, which needs separate spend approval.

## RB-018 reward pair with `seeded_random` (offline, $0)

Contract and results: [`docs/contracts/rb-018-reward-tool.md`](contracts/rb-018-reward-tool.md) §4.

| Comparison | Tool boundary | Runner | Code commit of the run | Results | Snapshot |
| --- | --- | --- | --- | --- | --- |
| `rb-018-reward-offline-v1` | #73 (main `7467424`) | #75 (main `8e86f96`) | `9229ea2` | §4 | `docs/spikes/rb-018-reward-report*.json` |

This is a separate comparison. It shares its settings key with RB-016 (settings exclude the comparison id, arms and generator id) but it is not a rerun of RB-016 or RB-015, and its results are not comparable with either.

What the run shows:

- 40 planned runs: 4 arms, the faulty and fixed synthetic reward targets, and 5 plan-wide seeds. `validateComparisonV2` found no issues and no warnings.
- `seeded_random` (generator `rb018-seeded-random-reward-v1`): INV-006 confirmed on all 5 independent seeds on the faulty target, with the first-violation actions and the median of 5 seeds in §4. No finding on any of the 5 seeds on the fixed target, by construction.
- `scripted_known`: 5 repeats of one deterministic script, not 5 independent samples. It confirmed INV-006 in every repeat on faulty, by construction.
- `llm_single` and `llm_dual` are `not_run`: no result, which is not a zero result.
- `comparable` means complete within `rb-018-reward-offline-v1` only.

Review status:

- **Reviewed:** the wording (Archivist), the boundary re-check (Wizard), product sign-off (Titan), and the merge call (Chronomancer), all on #75 at `e2790e5`.
- **Not verified by Archivist:** the test counts, the typecheck result, the run numbers and the byte-identical RB-015 and RB-016 checks. They come from the EO and Wizard runs recorded on #75, and Archivist has not re-run them.

Honesty caps, which apply to every RB-018 number:

- Untuned default seeds against one planted defect; not a general detection rate.
- The fixed-target 0 is guaranteed by how the fixture is built, not measured.
- Offline only, synthetic fixture with one planted defect, paid spend $0. Thor-over-SSH runs are not `llm_dual` results. G4 is Not run, and the pitch is not closed. Not evidence of general exploit-detection performance.

Out of scope until later work: reduced-trace length, which is now RB-017 (below); and any batch live (LLM) evaluation, which needs separate spend approval.

## RB-017 bounded trace reduction (offline, $0)

Contract and results: [`docs/contracts/rb-017-trace-reduction.md`](contracts/rb-017-trace-reduction.md) §4.

| Input | Reducer and run | Code commit of the run | Results | Artifacts |
| --- | --- | --- | --- | --- |
| The 5 confirmed `seeded_random` faulty traces from `rb-018-reward-offline-v1`, plus the `scripted_known` control | #77 (main `8f0bdd9`) | `df08834` | §4 | `docs/spikes/rb-017-reduced-traces*.json` |

This is not a benchmark comparison. It shrinks existing RB-018 traces and does not create new runs.

What the run shows:

- Each of the 5 input traces was reduced, and every accepted reduction replayed the same INV-006 violation on the same action with the same per-step results. The per-trace lengths and replays used are in §4.
- Each reduced length is the shortest reduction found here: the reducer stops once no single remaining action can be removed, so it is not a property of the defect and is not claimed to be minimal.
- The control (hand-written, by construction; not an input) was reduced the same way and is not counted as a result.
- The originals are kept byte for byte next to the reduced traces.
- Lengths are per trace only. There are no averages, medians or rates across traces.

Review status:

- **Reviewed:** the wording (Archivist), the replay-boundary review (Wizard), product sign-off (Titan), and the merge call (Chronomancer), all on #77 at `9bff5ee`.
- **Not verified by Archivist:** the test counts, the typecheck result, the per-trace numbers and the byte-identical RB-015, RB-016 and RB-018 checks. They come from the EO and Wizard runs recorded on #77, and Archivist has not re-run them.

Honesty caps, which apply to every RB-017 number:

- Untuned default seeds against one planted defect; not a general detection rate.
- A reduced length is a result for these traces on synthetic-reward-faulty only, not a claim about any other trace, target or defect.
- Offline only, synthetic fixture with one planted defect, paid spend $0, no model calls. Thor-over-SSH runs are not `llm_dual` results. G4 is Not run, and the pitch is not closed. Not evidence of general exploit-detection performance.

## RB-019 broader independent invariant tests (offline, $0)

Contract and results: [`docs/contracts/rb-019-invariant-tests.md`](contracts/rb-019-invariant-tests.md).

| Tests | PR | Results |
| --- | --- | --- |
| Single-field corruptions, seeded legitimate sequences, verifier import boundary, verifier throw | #79 (main `1b1d358`) | §1 to §4 |

This is not a benchmark comparison. It adds tests and a contract doc only, and the RB-015 to RB-018 artifacts are unchanged.

What the tests show:

- Each of INV-001 to INV-006 has a valid case and at least one single-field corruption, and each corruption reports exactly the expected invariant id and no other (§1). For INV-001 that is trivially true, because the schema check returns before any other invariant runs. A structurally invalid snapshot on the transition path is a boundary input error, not an INV-001 finding.
- The verifier reported no violations on the fixed trade and reward targets in the generated sequences on fixed seeds (§2). The controls on the faulty fixtures, by construction, only show the harness is not blind on these two planted defects; the reward sequences that do not reach INV-006 are not evidence of anything. Counts are in §2.
- `packages/verifier` imports only `@rulebreak/contracts`, `node:crypto` and its own files (§3).
- A verifier throw never ends as `no_violation_observed` (§4). Campaign status after a throw is RB-020.
- These tests found no verifier bug, so there is no fix PR.

Review status:

- **Reviewed:** the wording (Archivist), the verifier-owner review (EO), product sign-off (Titan), and the merge call (Chronomancer), all on #79 at `90dfe1d`.
- **Not verified by Archivist:** the test counts, the typecheck result and the pinned sequence counts. They come from the Wizard and EO runs recorded on #79, and Archivist has not re-run them.

Honesty caps, which apply to every RB-019 result:

- These hand-built cases and these fixed seeds on the in-repo synthetic fixtures, with two planted defects. Not a claim that the verifier is correct in general or that its coverage is complete; not a general detection rate.
- Offline only, paid spend $0, no model calls. Thor-over-SSH runs are not `llm_dual` results. G4 is Not run, and the pitch is not closed. Not evidence of general exploit-detection performance.

## RB-020 verifier-throw campaign status (offline, $0)

Contract: [`docs/contracts/rb-020-terminal-status.md`](contracts/rb-020-terminal-status.md).

| Change | PR | Where |
| --- | --- | --- |
| Server: terminal status on throws; one status source for POST, `done` and GET | #81 (main `a34241a`) | contract §1 to §4 |
| UI: evidence-screen copy from the refetched final status | #82 (main `1a2236d`) | `apps/web/src/api/terminalStatus.ts` |

This is not a benchmark comparison. The RB-015, RB-016 and RB-018 bench outputs match main apart from wall time, commit and timestamps, and the RB-017 artifact is byte-identical.

What the change shows:

- For the throws handled here (`verifier_error` in the scripted runner and the control API, `run_error` and `replay_error` in the control API), the campaign ends `failed` / `error` and never `completed`, `no_violation_observed` or `running`. Actions recorded before the throw are kept. One test per case is listed in the contract §4.
- `ok: true` on the `done` event only means the stream finished; read `status` and `outcome`.
- A `confirmed` finding can sit on a `failed` / `error` campaign, and the campaign error never downgrades the finding.
- A malformed target snapshot is a boundary input error, not INV-001.
- The UI never shows the no-finding or no-violation text for an error, stopped or unknown run. EO also ran the real server through the UI's own parsing and labels for six cases; `stopped` and a dropped stream are covered only by unit tests.

RB-020 left two paths out of scope: a non-verifier throw in the scripted runner used on its own, and a throw while the runner is being built. RB-021 (below) closes both.

Review status:

- **Reviewed:** #81 boundary (Wizard), wording (Archivist), product sign-off (Titan) and merge call (Chronomancer) at `d25f50a`. #82 field-contract check (EO), copy (Archivist), product sign-off (Titan) and merge call (Chronomancer) at `413e2db`.
- **Not verified by Archivist:** the test counts, typecheck and build results, the bench checks and EO's live-server label run. They come from the EO, Wizard and Goblin runs recorded on #81 and #82, and Archivist has not re-run them.

Honesty caps, which apply to every RB-020 result:

- Offline only, synthetic fixtures, paid spend $0, no model calls. LLM arms are `not_run`: no result, not a zero. Thor-over-SSH runs are not `llm_dual` results. G4 is Not run, M13 is Partial, and the pitch is not closed. Not evidence of general exploit-detection performance, and no security claim.

## RB-021 RB-020 follow-up: standalone runner throws, `start_error`, typed API errors (offline, $0)

Contract: [`docs/contracts/rb-020-terminal-status.md`](contracts/rb-020-terminal-status.md) (§1, §2a, §4).

| Change | PR | Where |
| --- | --- | --- |
| Server: the runner records every throw itself; `start_error`; typed API error codes | #84 (main `b3fe827`) | contract §1, §2a, §4 |
| UI: "Failed to start", request-failure and non-final-status labels; cleanup | #85 (main `25b1b85`) | `apps/web/src/api/terminalStatus.ts`, `apps/web/src/api/client.ts` |

This is not a benchmark comparison. The RB-015, RB-016 and RB-018 bench outputs match main apart from wall time, commit and timestamps, and the RB-017 artifact is byte-identical.

What the change shows:

- For the tested throw paths (contract §4), whether the scripted runner is used on its own or under the control API, the campaign ends `failed` / `error` and never `completed`, `no_violation_observed`, `pending` or `running`, when the evidence store accepts the failure writes. A store that rejects every write cannot record `failed`; the throw still reaches the caller, and the control API answers 500. A throw before the campaign row exists leaves no row.
- Only the first failure is written, so a verifier throw records only `verifier_error`. A malformed envelope ends as `verifier_error`.
- A throw while building the runner answers HTTP 500 with the pinned `start_error` body and no session; GET and the stream answer 404 `campaign_not_found`. A non-2xx response without a `code` is a request failure, never `start_error`.
- The UI shows "Failed to start" only for `start_error` and never shows the no-finding or no-violation text for it.

RB-021 left three UI gaps: when the finding failed to load after a good run, the screen wrongly said "no campaign status was returned"; a 404 refetch did not say the campaign wasn't found; and the `useCampaignSession` branching had no test. RB-022 (below) closes them.

Review status:

- **Reviewed:** #84 boundary (Wizard), wording (Archivist), product sign-off (Titan) and merge call (Chronomancer) at `c43aadf`. #85 field-contract check (EO), copy (Archivist), product sign-off (Titan) and merge call (Chronomancer) at `3fa714a`.
- **Not verified by Archivist:** the test counts, typecheck and build results and the bench checks. They come from the EO, Wizard and Goblin runs recorded on #84 and #85, and Archivist has not re-run them.

Honesty caps, which apply to every RB-021 result:

- Offline only, synthetic fixtures, paid spend $0, no model calls. LLM arms are `not_run`: no result, not a zero. Thor-over-SSH runs are not `llm_dual` results. G4 is Not run, M13 is Partial, and the pitch is not closed. Not evidence of general exploit-detection performance, and no security claim.

## RB-022 RB-021 UI follow-up: finding-load error, refetch not-found, campaignFlow tests (offline, $0)

Contract: unchanged ([`docs/contracts/rb-020-terminal-status.md`](contracts/rb-020-terminal-status.md)). RB-022 changes `apps/web` only.

| Change | PR | Where |
| --- | --- | --- |
| UI: finding-load error state; refetch `campaign_not_found` label; `useCampaignSession` branching as pure functions with tests | #87 (main `bc1f5d5`) | `apps/web/src/hooks/campaignFlow.ts`, `apps/web/src/hooks/campaignFlow.test.ts`, `apps/web/src/api/terminalStatus.ts`, `apps/web/src/hooks/useCampaignSession.ts` |

This is not a benchmark comparison. It is display-only, with no server, contract, runner or bench change.

What the change shows:

- When finding details fail to load after a good run, the UI reads "Finding details could not be loaded." in its own `findingLoadError` state. The run's status from the refetch is unchanged, and the screen never says "no campaign status was returned".
- When the stream ended with no final status and the refetch gets a 404 with code `campaign_not_found`, the UI reads "Final status unknown (campaign not found on refetch)", which is not a clean result. A bare 404 with no `code`, or any other refetch failure, reads "Final status unknown (stream closed; refetch failed)". If a `done` payload already gave a final status and the refetch fails, the UI keeps the `done` status; a successful refetch replaces it.
- The `useCampaignSession` branching is in pure functions in `apps/web/src/hooks/campaignFlow.ts` (`refetchTerminal`, `loadFindingDetail`, `startFailure`), with tests in `campaignFlow.test.ts`. The hook only applies their results to state.

Known gap, scheduled as RB-023 (see `docs/team/BOARD.md`): the usage line reads missing usage as zero. `usageFor()` (`apps/server/src/index.ts:49-67`) writes `tokens: 0` and `costUsd: 0` as constants, and `apps/web/src/views/ActivityTimeline.tsx:70-71` shows any missing field, or no usage at all, as 0. The usage counter's $0 and 0 tokens were constants, not measured; the offline $0 claim rests on never calling a paid provider, not on this counter.

Review status:

- **Reviewed:** #87 wording (Archivist, PR comment 5961355692; earlier review at `cfb29b8` in comment 5961294901), engineering re-check (EO, posted in the Rulebreak room), product sign-off (Titan) and merge call (Chronomancer) at `02638a9`.
- **Not verified by Archivist:** the test counts and the typecheck and `build:web` results. They come from Goblin's run recorded on #87 and EO's fresh-clone re-check on `5bf7f81` posted in the room, and Archivist has not re-run them.

Honesty caps, which apply to every RB-022 result:

- Display-only copy and state; no change to how any run is recorded or scored.
- Offline only, synthetic fixtures, paid spend $0, no model calls. LLM arms are `not_run`: no result, not a zero. Thor-over-SSH runs are not `llm_dual` results. G4 is Not run, M13 is Partial, and the pitch is not closed. Not evidence of general exploit-detection performance, and no security claim.
