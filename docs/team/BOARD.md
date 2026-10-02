# Rulebreak — Task Board

Owner: Scrum Master Chronomancer  
Source: AGENTS.md §19 · mirrored on [GitHub Project #4](https://github.com/users/MarcoDotIO/projects/4)  
Updated: 2026-10-02 ~7:30 PM ET

## Status for humans

**P0 demo claim (ship):** offline evidence path — scripted known failure → independent INV → store-backed `confirmed` only after same-target `matched_violation` → safety regression (faulty red / fixed green) → three views (Candidate A chrome).

**Demo freeze (C): Done.** Frozen at main `a1367e2` (#48, #50, #51). Pitch-limitations page shipped in #52 (`5a3ee4b`): nine honesty caps, none shown as a Pass, pitch not closed, nothing labelled secure. Display-only; no runtime or API change. #54 (`fba0751`) moved the demo-center pill to a `neutral` kind; copy unchanged. B does not touch the frozen demo.

**Live path (evidence Done, pitch not closed):** Thor SSH networked LLM only. Paid cloud hard cap **$0**. SSH ≠ G4 containment. Secrets stay in gitignored `.env` (never in BOARD/artifacts/chat). Browser never SSHs; password never leaves the server as more than a boolean.

**RB-011 evidence:** #48 — dual-agent Thor Mac Pass. **rb011 Done**; pitch **not** closed; not AgenC dual sessions.

**UI-DUAL:** #50 @ `552193b` — **Done**. Live provenance + dual-agent enablement on Candidate A. **M13 = Partial-on-UI-SSH** (right grade). Unlock ≠ closed pitch; SSH≠G4; G4 Not run.

**Do not sell:** live agent discovery as a closed / contained pitch. Offline G4-P3 + G4-P4 stay **Not run**.

**RB-015 seeded baseline (B): v1 and v2 Done; v1 code removed.** Evidence index: `docs/evaluation.md`. Results live only in the contract, §8 for v1 (code commit `72f47af`) and §10 for v2 (code commit `3d5dd61`).
- v2 contract #60 (`47c8312`) and v2 runner and store tables #63 (`3e7123e`). The runner writes to the insert-only `benchmark_*` tables in `EvidenceStore`, and the report is exported from them.
- #65 (`f8427a6`) removed the v1-only contract exports and tests. §8 and the v1 snapshot are kept as history, and §9 is the contract in force. Runner, store and v2 results are unchanged. #67 (`c23cbce`) fixed the contract doc wording.
- 20/20 planned runs; `validateComparisonV2` found 0 issues and 0 warnings.
- Both offline arms confirmed INV-003 on 5/5 faulty runs. The clean-target zeros are **guaranteed by how the fixture is built, not measured**.
- The action sequences and outcomes are identical to v1.
- The LLM arms are `not_run`, which is not the same as zero findings.
- Offline only and $0, with a synthetic fixture and one planted defect. This is not evidence of general exploit detection. Thor runs are not `llm_dual`. G4 is Not run, and the pitch is not closed.

**RB-016 duplicate-reward fixture: Done.** Contract: `docs/contracts/rb-016-reward.md` (§7 is the reward-pair run). Evidence index: `docs/evaluation.md`.
- #68 (`87160e5`) fixture and `INV-006` in the new `rulebreak-reward-v1` pack; #69 (`bac1ba2`) doc follow-up; #71 (`ba768e2`) runner wiring and the offline reward-pair run.
- Comparison `rb-016-reward-offline-v1`, 1 seed, 8 planned runs; own settings key, so a new comparison, not a rerun of RB-015 v2. `validateComparisonV2`: 0 issues, 0 warnings.
- **The scripted run confirmed `INV-006`, by construction.** `scripted_known` was written to hit it, so this is not explorer-discovered and not a rate. The 0 on the fixed target comes from how the fixture is built, not measured.
- `seeded_random`, `llm_single` and `llm_dual` are `not_run` ("no reward_claim tool"): no result, not a zero. `comparable` holds within `rb-016-reward-offline-v1` only.
- `bench:rb015` output, `rulebreak-trade-v1` and the RB-015 v2 settings key are unchanged. Offline, $0, no live or LLM path.

**RB-018 offline `reward_claim` explorer action: Done.** Contract: `docs/contracts/rb-018-reward-tool.md` (§4 is the run). Evidence index: `docs/evaluation.md`.
- #73 (`7467424`) tool boundary: `isExplorerToolAllowed` allows `reward_claim` only for `offline_fixture` on the reward family with `scripted_known` or `seeded_random`, and fails closed otherwise. The MCP tool list, `EXPLORER_ALLOWLIST_P0` and live-off are unchanged. `docs/threat-model.md` §5 has the offline, fixture-only exception line.
- #75 (`8e86f96`) wiring and the new comparison `rb-018-reward-offline-v1`: 40 planned runs (4 arms × 2 targets × 5 seeds); `validateComparisonV2` found 0 issues and 0 warnings.
- **`seeded_random`:** INV-006 confirmed on all 5 independent seeds on the faulty target (median first violation at action 35, median of 5 seeds). No finding on any of the 5 seeds on the fixed target, by construction: that 0 comes from how the fixture is built, not measured.
- **`scripted_known`:** 5 repeats of one deterministic script, not 5 independent samples. It confirmed INV-006 in every repeat, by construction.
- Caveat on every result: untuned default seeds against one planted defect; not a general detection rate. `llm_single` and `llm_dual` are `not_run`: no result, not a zero. `comparable` holds within `rb-018-reward-offline-v1` only; it shares a settings key with RB-016 but is not comparable with it.
- RB-015 and RB-016 artifacts unchanged. Offline, $0, no live or LLM path.

**RB-017 bounded trace reduction: Done.** Contract: `docs/contracts/rb-017-trace-reduction.md` (§4 is the run). Evidence index: `docs/evaluation.md`.
- #77 (`8f0bdd9`): range-deletion reducer in `packages/replay/src/reduce.ts`, replaying every candidate from the original starting state (strict start-state hash for the reducer only), with no model calls, offline and $0. Bounds: 100 replays and 10,000 ms per trace.
- Inputs are the 5 confirmed `seeded_random` faulty traces from `rb-018-reward-offline-v1`; the 4-action `scripted_known` trace is a control (hand-written, by construction; not an input). Originals are kept byte for byte next to the reduced traces.
- Each trace was reduced to 2 actions, the shortest reduction found here: the reducer stops once no single remaining action can be removed, so 2 is not a property of the defect and is not claimed to be minimal. Per-trace lengths and replays used are in §4; no averages or rates.
- Caveat on every result: untuned default seeds against one planted defect; not a general detection rate. RB-015, RB-016 and RB-018 artifacts unchanged.

**RB-019 broader independent invariant tests: Done.** Contract: `docs/contracts/rb-019-invariant-tests.md`. Evidence index: `docs/evaluation.md`.
- #79 (`1b1d358`): tests and the contract doc only; nothing under `packages/` or `scripts/` changed, and the RB-015 to RB-018 artifacts are unchanged. Offline, $0.
- Single-field corruptions: INV-001 to INV-006 each have a valid case and at least one corruption that changes exactly one field; each corruption reports exactly the expected invariant id and no other. A structurally invalid snapshot on the transition path is a boundary input error (the verifier throws), not an INV-001 finding.
- Seeded legitimate sequences (with a fixed 0.2 share of rule-refused calls): no violations reported on 20 generated sequences on fixed seeds on the fixed trade target and 20 on the fixed reward target. Controls, by construction: 19 of the 20 generated sequences on fixed seeds reach a violation on the faulty trade fixture, and 14 of the 20 reach INV-006 on the faulty reward fixture; the other 6 are not evidence of anything. Not a general detection rate.
- Import check: `packages/verifier` imports only `@rulebreak/contracts`, `node:crypto` and its own files. A verifier throw never ends as `no_violation_observed`. These tests found no verifier bug, so there is no fix PR.

**RB-020 verifier-throw campaign status: Done.** Contract: `docs/contracts/rb-020-terminal-status.md`. Evidence index: `docs/evaluation.md`.
- #81 (`a34241a`, server): a verifier throw (`verifier_error`) or any other throw during the run (`run_error`) in the control API, a verifier throw in the scripted runner, and a throw in the confirming replay, control replay or export (`replay_error`) end the campaign `failed` / `error`. Actions recorded before the throw are kept, and a `system_error` event closes out the half-recorded action. These handled throws never end as `completed`, `no_violation_observed` or `running`, with one test per case. POST, the closing `done` event and the `GET /api/campaigns/:id` refetch read the same stored row. A malformed target snapshot is a boundary input error, not INV-001. A `confirmed` finding can sit on a `failed` / `error` campaign; the campaign error never downgrades it.
- #82 (`1a2236d`, UI): the evidence screens take the final status from the refetch. Error runs read "Failed (verifier error)", "Failed (run error)" or "Failed (replay error)", with "partial actions recorded" for run-time throws, and a confirmed finding on a failed run reads "Failed after confirmation (export or control replay error)". A completed run with no finding reads "No violation observed in this run" with a neutral pill. Error, stopped and unknown runs never get the no-finding text.
- RB-015, RB-016 and RB-018 bench outputs match main apart from wall time, commit and timestamps; the RB-017 artifact is byte-identical. Offline, $0.

**RB-021 RB-020 follow-up: Done.** Contract: `docs/contracts/rb-020-terminal-status.md` (title, §1, §2a and §4 extended). Evidence index: `docs/evaluation.md`.
- #84 (`b3fe827`, server): the scripted runner now records every throw itself, whether used on its own or under the control API. A throw while executing or recording an action, or in `run()` outside an action, ends `failed` / `error` with `run_error`; actions committed before it stay recorded, and the half-recorded action is closed out. A throw while building the runner after its row was written ends that row `failed` / `error` with `start_error`. Callers record a replay, control replay or export throw with `recordFailure("replay_error", …)`, and the finding keeps its status. Only the first failure is written, so a verifier throw still records only `verifier_error`. These tested throw paths never end as `completed`, `no_violation_observed`, `pending` or `running` when the store accepts the failure writes; a store that rejects every write cannot record `failed`, and the control API then answers 500, not a 200 that says `running`.
- #84, control API: a throw while building the runner answers HTTP 500 with Wizard's pinned body `{error, code: "start_error", campaignId, status: "failed", outcome: "error"}`, registers no session, and GET and the stream answer 404 `campaign_not_found`. `campaign_exists` (409) and `campaign_record_missing` (500) are typed too, and `error` stays a string. The operator 401/503, the stop and findings 404s and Fastify's 414 still carry no `code`; a non-2xx response without a `code` is a request failure, never `start_error`.
- #85 (`25b1b85`, UI): "Failed to start" appears only for `code: "start_error"`, with "Failed to start. No actions were run; this is not a no-violation result." Any other non-2xx reads "Request failed (HTTP n); no campaign status was returned." A successful refetch that reports a non-final status reads "Final status unknown (server reported a non-final status)", and "refetch failed" is kept for an actual refetch failure. A stream that drops before `system_error` is labelled from the refetched status ("Failed (error)") without guessing the error kind. The unused `TerminalSource` type, the `?? campaign.status` fallback and the stale `systemErrorCode` comment are gone.
- RB-015, RB-016 and RB-018 bench outputs match main apart from wall time, commit and timestamps; the RB-017 artifact is byte-identical. Offline, $0.

**RB-022 RB-021 UI follow-up: Done.** Contract unchanged (`docs/contracts/rb-020-terminal-status.md`). Evidence index: `docs/evaluation.md`.
- #87 (`bc1f5d5`, UI, `apps/web` only): display-only; no server, contract or runner change. When finding details fail to load after a good run, the screen reads "Finding details could not be loaded." in its own `findingLoadError` state, and the run's status from the refetch is unchanged; it never says "no campaign status was returned".
- #87, refetch: when the stream ended with no final status and the refetch gets 404 with code `campaign_not_found`, the screen reads "Final status unknown (campaign not found on refetch)", which is not a clean result. A bare 404 with no `code`, or any other refetch failure, reads "Final status unknown (stream closed; refetch failed)". If a `done` payload already gave a final status and the refetch fails, the UI keeps the `done` status; a successful refetch replaces it.
- #87, tests: the `useCampaignSession` branching moved into pure functions in `apps/web/src/hooks/campaignFlow.ts` (`refetchTerminal`, `loadFindingDetail`, `startFailure`), with tests in `campaignFlow.test.ts`. The hook only applies their results to state.
- Offline, $0; no new claims in copy.

**RB-023 Usage not reported: Done.** Contract unchanged (`UsageLedgerSchema` already marks `tokens` and `costUsd` optional). Evidence index: `docs/evaluation.md`.
- #89 (`b258640`, server, pinned to `11af502`): `usageFor()` (`apps/server/src/index.ts`) no longer sends `tokens` or `costUsd`; before #89 both were the constant 0, not measured. `toolCalls` and `mutations` are real counts from stored action rows. `tests/integration/rb-023-usage-not-reported.test.ts` pins the exact usage key set and checks both keys are absent on POST and GET for both fixtures. EO reports the `bench:rb015`, `bench:rb016`, `bench:rb018` and `reduce:rb017` artifacts match main (33 items; RB-017 byte-identical).
- #90 (`72da51d`, UI, pinned to `c4bfbd3`): `formatUsage()` (`apps/web/src/api/usageLine.ts`) replaces the `?? 0` in `ActivityTimeline`. Each missing field reads "not reported" on its own, a null usage reads "Usage not reported", a real 0 still reads 0, and the singular forms are tested. Usage also updates from the GET refetch: a GET with no usage reads "Usage not reported", and a failed refetch keeps the POST counts. A first-run `start_error` shows "Usage not reported".
- #90, fresh run state: `freshRunState()` in `apps/web/src/hooks/campaignFlow.ts` resets all 12 per-run fields, including `campaign` and `usage`, and `reset()` and `startFaulty` both apply it through `applyRunState`. Before this, a failed second start left the old run's counts beside "Failed to start" and a false "Running" pill with Stop enabled on the old campaign id. The reset is tested as a pure function only: removing the `applyRunState` call from `startFaulty`, or `setCampaign` from `applyRunState`, would not fail any test. The hook-level harness is RB-024.
- #90 also pins literal counts in the server test (faulty: 3 tool calls and 3 mutations; fixed: 3 tool calls and 2 mutations) and fixes the `terminalStatus.ts` comment ("failed or returned not_found"). No dependency changes. Offline, $0; the offline $0 claim rests on never calling a paid provider, not on the usage counter.

**RB-024 Run-state test harness and stale-run race: Done.** No contract change. Evidence index: `docs/evaluation.md`.
- #92 (`6ae0e72`, UI, pinned to `bb49bfb`): a `runGen` run-generation token in `apps/web/src/hooks/useCampaignSession.ts` guards every async continuation: the POST result, the stream callbacks, the refetch and its "ready" status, the finding load, the start-failure catch and `requestStop`. `startFaulty`, `reset` and unmount bump it, and stopping the old stream releases the old run's wait. The race was pre-existing: closing the stream did not cancel in-flight requests.
- #92, typed setters: `applyRunState` is built from a setter map typed against `RunState` (`{ [K in keyof RunState]: … }`), so dropping a field fails `tsc`.
- #92, hook test: `apps/web/src/hooks/useCampaignSession.test.ts` runs the hook with jsdom on for that file only (`// @vitest-environment jsdom`) and a fake client whose promises are resolved by hand; no timers, no network. It covers a late refetch, a late finding load (success and failure), a late successful POST, late stream callbacks, a reset during a refetch and a stale Stop, and checks that a new run starts with every `RunState` field fresh.
- #92, dependencies: dev dependencies `jsdom` 30.1.1, `@testing-library/react` 16.3.3 and `@testing-library/dom` 10.4.2, exact, in `apps/web` only. No UI copy, server or payload change.
- EO's mutation table (EO's report): removing each guard fails a test or `tsc`. The exceptions were addressed in the RB-024 / pills follow-up (#95) below.
- Reviews: Engineer Overlord, Product Manager Titan and Mnemosyne Archivist at `bb49bfb`. Offline, $0.

**Pitch-caps finding-status pills: Done.** No contract change. Evidence index: `docs/evaluation.md`.
- #94 (`9d69a07`, UI, pinned to `3bc6385`): the Pitch limitations page and the setup screen's "pitch not closed" chip use four pitch-only kinds, `cap_not_closed`, `cap_partial`, `cap_not_run` and `cap_not_claim` (dashed or dotted outline, transparent background), and never a finding kind. Before #94 the caps used `candidate` and `inconclusive`.
- #94, types: `PitchPill` accepts only `PitchPillKind` (six kinds: `neutral`, `blocked_as_expected` and the four `cap_*` kinds; no finding status), and `StatusPill`'s `kind` is typed as `PillKind`.
- #94, tests: the CSS test parses every rule in `StatusPill.module.css`: no rule groups a cap kind with a finding status, each cap kind has exactly one rule of its own, and no cap rule has a solid border or a fill. Each pill's text and kind is pinned, the setup chip's label is pinned, and `CAP_STATUS_COVERAGE` records every cap status as pinned to a pill or deliberately left out.
- #94, copy: #50's pill now reads "Done · pitch not closed", matching #48 (was "Done ≠ closed pitch"). G4-P3 / G4-P4 stays "Not run" and M13 stays "Partial-on-UI-SSH". No other text change.
- The `cap_not_run` and `cap_not_claim` borders use `--mute`, with contrast ratios of 5.5 to 7.4:1 (EO's report).
- Display-only, `apps/web` only: no dependency, server, payload or docs change.
- Reviews: Engineer Overlord, Product Manager Titan and Mnemosyne Archivist at `3bc6385`. Offline, $0.

**RB-024 / pills follow-up: Done.** No contract change. Evidence index: `docs/evaluation.md`.
- #95 (`0d04876`, UI, pinned to `b8f3ed8`): all nine parked items landed in 4 files in `apps/web/src` (`useCampaignSession.test.ts`, `pitchCaps.test.ts`, `pitchCaps.ts`, `StatusPill.tsx`). Tests, types and comments only; no user-facing copy, server, dependency or docs change.
- From #92: two unmount tests (mid-refetch, and while the POST is pending); `expectSettled()` makes a stale run that fails to settle fail an assertion instead of hanging; `clearFake()` runs before each second mount that reuses id "b", and the comments say why.
- From #94: a source test that `PitchLimitations.tsx` renders `<PitchPill` and does not mention `StatusPill`; `PITCH_PILL_KINDS ... as const satisfies readonly PillKind[]` replaces `Extract`, so a name that is not a `PillKind` fails `tsc`; the CSS test says its parser is flat, and a new test fails if the stylesheet gains an at-rule or nested block; the three comment and title fixes.
- Reviews: Engineer Overlord engineering approval at `b8f3ed8` (EO's report: 332 passed / 5 todo with outbound network blocked, both `tsc` runs and `build:web` clean, and each guard and test removal EO tried now fails a test, and the comment fixes are in, with one surviving mutation tracked below as the pitch-pill kind guard); Product Manager Titan product sign-off; Mnemosyne Archivist wording approval (PR comment 5962903899). Chronomancer approved the merge. Offline, $0.

**Next: Pitch-pill kind guard.** Owner: UI Design Goblin; reviews by Engineer Overlord, Mnemosyne Archivist and Product Manager Titan.
- Add a one-line test that `PITCH_PILL_KINDS` contains no `FindingStatusSchema.options` value (`PITCH_PILL_KINDS` ∩ `FindingStatusSchema.options` = ∅).
- Why: EO's surviving mutation on #95. A finding kind such as `"candidate"` can be added to `PITCH_PILL_KINDS` without any error, because finding kinds are valid `PillKind`s. A finding kind on a pitch pill would make a cap read as a store-backed finding (Titan).
- Also folds Archivist's two optional #95 nits: `StatusPill.tsx:6` "pitch chip" → "pitch pill"; the `expectSettled` message at `useCampaignSession.test.ts:178` says "stale run" and should also cover unmounted runs.

**RB-025 Fresh-checkout demo rehearsal (P1).** In flight: Backend Architect Wizard started rehearsing from main `8f52f3e` at ~7:26 PM ET and names that commit in the report. Mnemosyne Archivist fixes doc drift; reviews by Engineer Overlord and Product Manager Titan. Independent of the pitch-pill kind guard (one test plus two comment and message fixes). Acceptance:
1. From a fresh clone of main, follow only `README.md` and `docs/demo.md`, offline, $0. Record pass or fail for each step; a step that needs outside knowledge is a fail.
2. Every on-screen demo claim matches the honesty caps as written: "by construction", "confirmed on all 5 independent seeds", "reduced, the shortest reduction found here", "pitch not closed", G4-P3 / G4-P4 "Not run", "Usage not reported".
3. Fixes are docs-only. Any code bug becomes its own row and is not patched in RB-025.
4. RB-015 to RB-024 artifacts unchanged.

**Parked: (A)** AgenC dual-session gap — needs real AgenC dual sessions (not offline / $0); waits on Marco's spend decision; no acceptance line written yet.

## Done on main (highlights)

| ID | Notes |
| --- | --- |
| RB-001–010, 012–014 | Foundations through acceptance matrix + Verified docs walks |
| Confirm promotion | #23 — durable `confirmed` via `applyConfirmingReplay` |
| Offline probes | #25–#32 · #37 G3-P3 true bound observe Pass |
| G2-P3 Verified docs | #34 — Verified offline walk + shared-cwd caveat |
| G4-P3 / G4-P4 honesty | #39–#42 — Done as **Not run** |
| Offline RB-013 matrix | #41 — M1–M11+N1–N4 Pass |
| Thor live wiring | #44 — Mac smoke Pass as wiring only |
| M12 live UI acceptance | #46 — labels / SSH≠G4 only |
| RB-011 dual-agent Thor | #48 — evidence Done; pitch not closed |
| Live G2–G4 (Thor evidence) | #48 — Done on evidence bar; **not** a closed pitch |
| UI-DUAL enablement | #50 — Candidate A live provenance + enablement; M13 Partial-on-UI-SSH |
| C: demo freeze + pitch limitations | #52 — **Pitch limitations** page, nine honesty caps; display-only; freeze basis `a1367e2` · #53 BOARD · #54 neutral pill (copy unchanged) · Project #4 `DEMO-C` Done |
| RB-015 v1 seeded baseline | #56 contract · #58 offline runner (`047715a`) — offline arms only, LLM arms `not_run`; fixed-target 0 by construction |
| RB-015-v2 | #60 contract (`47c8312`) · #61 doc follow-up (`278109f`) · #63 runner + store tables (`3e7123e`) · `docs/evaluation.md` evidence index (#64) |
| RB-016 duplicate-reward fixture | #68 fixture + `INV-006` (`87160e5`) · #69 doc follow-up (`bac1ba2`) · #71 runner wiring + reward-pair run (`ba768e2`) — `scripted_known` only, confirmed `INV-006` by construction; other arms `not_run` |
| RB-018 offline `reward_claim` explorer action | #73 tool boundary (`7467424`) · #75 wiring + `rb-018-reward-offline-v1` (`8e86f96`) — `seeded_random` confirmed INV-006 on all 5 independent seeds on faulty, no finding on fixed by construction; untuned default seeds, one planted defect, not a rate |
| RB-017 bounded trace reduction | #77 (`8f0bdd9`) — 5 `seeded_random` faulty traces from RB-018 each reduced to 2 actions, the shortest reduction found here (not claimed to be minimal); control labelled; originals kept byte for byte; untuned default seeds, one planted defect, not a rate |
| RB-019 broader independent invariant tests | #79 (`1b1d358`) — single-field corruptions per INV-001–006; no violations on 20 + 20 generated sequences on fixed seeds; controls 19 of 20 (trade) and 14 of 20 (reward) by construction; verifier import check; no verifier bug found |
| RB-020 verifier-throw campaign status | #81 server (`a34241a`) · #82 UI (`1a2236d`) — handled throws end `failed` / `error` with partial actions, never `running` or clean; one status source for POST, `done` and GET; malformed snapshot is a boundary input error; follow-ups in RB-021 |
| RB-021 RB-020 follow-up | #84 server (`b3fe827`) · #85 UI (`25b1b85`) — tested throw paths in the standalone runner and the control API end `failed` / `error` (when the store accepts the failure writes); typed `start_error` and API error codes; UI "Failed to start", request-failure and non-final-status labels; follow-ups in RB-022 |
| RB-022 RB-021 UI follow-up | #87 UI (`bc1f5d5`) — display-only, `apps/web` only; "Finding details could not be loaded." in its own state with the run's status unchanged; refetch 404 `campaign_not_found` reads "campaign not found on refetch", not a clean result; `useCampaignSession` branching moved to pure `campaignFlow.ts` functions with tests; follow-up in RB-023 |
| RB-023 Usage not reported | #89 server (`b258640`) · #90 UI (`72da51d`) — server omits unmeasured `tokens` / `costUsd` (were constant 0, not measured); UI reads "not reported" per missing field and "Usage not reported" for null usage, real 0 still 0; usage also from the GET refetch; `freshRunState()` clears all per-run fields (tested as a pure function only); follow-up in RB-024 |
| RB-024 Run-state test harness and stale-run race | #92 UI (`6ae0e72`) — `runGen` token guards every async continuation; setter map typed against `RunState` (dropped field fails `tsc`); hook test with jsdom for that file only and a hand-resolved fake client (late refetch, late finding load, late POST, late stream callbacks, reset during refetch, stale Stop); exact dev deps in `apps/web` only; parked nits landed in #95 (RB-024 / pills follow-up) |
| Pitch-caps finding-status pills | #94 UI (`9d69a07`) — four pitch-only `cap_*` kinds (dashed or dotted, transparent), never a finding kind; `PitchPill` takes `PitchPillKind` only and `StatusPill`'s kind is typed; CSS test parses every rule; pill text, kinds and setup-chip label pinned; cap status coverage map; #50 pill "Done · pitch not closed"; display-only, `apps/web` only; parked nits landed in #95 (RB-024 / pills follow-up) |
| RB-024 / pills follow-up | #95 UI (`0d04876`, pinned to `b8f3ed8`) — all nine parked nits from #92 and #94; 4 files in `apps/web/src`; tests, types and comments only, no user-facing copy; unmount tests, settle-by-assertion, `clearFake()`, `PitchLimitations` source test, `satisfies` pitch kinds, flat-parser test; one surviving mutation tracked as the pitch-pill kind guard |
| RB-015 v1 removal | #65 (`f8427a6`) — v1-only exports and tests removed; §8 and v1 snapshot kept as history; doc title covers v1 + v2 · #67 (`c23cbce`) contract doc follow-up |
| UI | Candidate A #28 shipped; night-market #24 reference-only |
| Spike honesty | Offline `spike:g2g4` **13/0/2** (G4-P3 + G4-P4 Not run) |

## In flight / next

| Item | Owner | Status | Notes |
| --- | --- | --- | --- |
| Pitch-pill kind guard | UI Design Goblin (reviews: Engineer Overlord, Mnemosyne Archivist, Product Manager Titan) | Next | One-line test that `PITCH_PILL_KINDS` contains no `FindingStatusSchema.options` value (∩ = ∅). Why: EO's surviving mutation on #95, a finding kind such as `"candidate"` can be added to `PITCH_PILL_KINDS` without error because finding kinds are valid `PillKind`s, and it would make a cap read as a store-backed finding (Titan). Also folds Archivist's two optional #95 nits: `StatusPill.tsx:6` "pitch chip" → "pitch pill"; `useCampaignSession.test.ts:178` `expectSettled` message to cover unmounted runs too |
| RB-025 Fresh-checkout demo rehearsal | Backend Architect Wizard (runs it); Mnemosyne Archivist (doc drift fixes); reviews: Engineer Overlord, Product Manager Titan | In flight (P1) | Wizard rehearsing from main `8f52f3e` (started ~7:26 PM ET), named in the report; independent of the pitch-pill kind guard row. Acceptance in Status: fresh clone of main, only `README.md` and `docs/demo.md`, offline, $0, pass or fail per step (outside knowledge needed = fail); on-screen claims match the caps as written ("by construction", "confirmed on all 5 independent seeds", "reduced, the shortest reduction found here", "pitch not closed", G4-P3 / G4-P4 "Not run", "Usage not reported"); docs-only fixes, any code bug gets its own row; RB-015 to RB-024 artifacts unchanged |
| A: AgenC dual-session gap | — | Parked | Needs real AgenC dual sessions and an acceptance line; waits on Marco's spend decision |

## Parked (P1)

- Crafting — first on the cut list; not scheduled.

## Coordination

- Local-only host (no cloud agents). Prefer `gh` for PR ops.  
- EO owns lockfile. SM owns `BOARD.md`. Titan mirrors Project #4.  
- Label live / scripted / mocked / recorded. Non-author review for verification / auth / replay.  
- Live provider: **Thor SSH networked LLM**; paid cloud **$0**.  
- UIs showing RB-015 rows must check `outcome` before `provenance` (`not_run` LLM rows carry `live`).  
- Open docs PR (Marco): #36 README / StreamBanner.  
- Demo frozen at `a1367e2`; only display-only follow-ups during the freeze.
