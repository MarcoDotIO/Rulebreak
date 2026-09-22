# RB-013 acceptance matrix

**Owner:** UI Design Goblin  
**Reviewer:** Engineer Overlord (E2E changes) · Product Manager Titan (AC coverage)  
**Status:** Results recorded 2026-09-22 15:02 EDT  
**Gate:** `npm run ci:offline` → **OK** (v26.5.0 / 11.17.0) — 57 tests passed / 5 todo + web build; live + ambient secrets refused  
**Main SHA:** `4aec200` (post #39 / Candidate A era: #28 + #34/#37/#39)  
**Host note:** Offline re-verify on Grok Bot box (`grok-bot-vm`); Mac.devices.kent.edu Shell not available to this executor — same Node/npm engines gate.  
**Depends on:** RB-009, UI stream (#16), RB-012, Candidate A (#28) — **satisfied on main**  
**Candidate A visual:** StreamBanner (not MOCK DATA) · copper `blocked_as_expected` honesty chip (not green secure) · provenance pills · three views (setup / timeline / finding) — **still intact on `4aec200`**  
**README caveat:** `apps/web/README.md` on main still says MOCK DATA; open PR #36 aligns docs — matrix Pass is on code, independent of #36 merge.

## How to use this matrix

1. Label every run: `scripted` | `recorded` | `live` | `mocked`.
2. Record **Pass / Fail / Blocked / N/A** with command output or artifact path.
3. Do **not** mark durable `confirmed` unless the store write actually promotes after successful same-target confirming replay (`applyConfirmingReplay` — Verified via `tests/integration/confirm-promotion.test.ts`).
4. Independent challenge: Goblin must not be the sole reviewer of verifier/replay UI evidence they authored.

## Product AC coverage

| AC | Covered by | Notes |
| --- | --- | --- |
| AC-01–03 / AC-05 economy + verifier + evidence package | Covered by suites invoked under M1–M5 (contracts/economy/verifier + persisted finding/trace/hashes); not re-listed as separate UI rows | Ownership stays with Backend/EO packages; matrix assumes those suites stay green |
| AC-04 scripted slice | M1, M2 | Known failure + fixed clean |
| AC-06 offline replay | M3 | `matched_violation` on faulty |
| AC-07 regression export | M4 | Faulty red / fixed green |
| AC-08 honest negatives | M2, M5 | No false confirmed on fixed |
| AC-09 provenance labels | M6 | UI pills + stream banner |
| AC-10 campaign controls | M7, M8 | Stop + eventId dedupe |
| AC-12 UI evidence flow | M6, M9 | Setup → timeline → finding |
| AC-13 boundaries | M10 | Live agents blocked; no spend |
| AC-14 fresh-checkout | M11 | `ci:offline` / Verified README commands |
| AC-11 live AgenC | M12 | **Out of pitch** until G2–G4 |

## Matrix

| ID | Scenario | Mode | Expected evidence | Run command / path | Result | Evidence link |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | Known trade-failure (faulty) | scripted | Finding `candidate` + `scripted`; INV-003/004; responsible action id | `POST /api/campaigns` `{fixtureMode:"faulty"}` / scripted-campaign suite | **Pass** | 2026-09-22 15:02 EDT: inside `ci:offline` — `tests/integration/scripted-campaign.test.ts` 5/5; finding `candidate`/`scripted` path |
| M2 | Same script on fixed target | scripted | No finding; no vulnerable/secure badge | `npm test -- tests/integration/scripted-campaign.test.ts` | **Pass** | Inside `ci:offline` — fixed path `no_violation_observed` |
| M3 | Offline replay on fresh faulty | recorded | `matched_violation` | `npm test -- tests/integration/replay-regression.test.ts` | **Pass** | Inside `ci:offline` — 3/3 |
| M4 | Fixed-target control replay + export | recorded | `blocked_as_expected`; export bundle; legitimate trade works | same suite | **Pass** | Inside `ci:offline` — export + legitimateTradeWorks |
| M5 | Legitimate trades on fixed | scripted | No conservation / uniqueness violation | economy unit + `legitimateTradeWorks()` | **Pass** | Inside `ci:offline` (economy + replay suites) |
| M6 | UI provenance + finding detail | scripted | Banner ≠ MOCK; scripted pills; invariant + action + replay separate from status | code review of `apps/web` on main + suites | **Pass** | 2026-09-22 15:02 EDT `@ 4aec200`: `StreamBanner` labels live-scripted/durable/offline (no MOCK DATA); FindingDetail shows status/mode/replay pills separately; copper timeline spine intact |
| M7 | Stop mid-run | scripted | Terminal stop; further admissions refused | scripted-campaign stop test | **Pass** | Inside `ci:offline` scripted-campaign suite |
| M8 | Reconnect / duplicate event ids | scripted | Timeline dedupes by `eventId` | UI `useCampaignSession` + scripted dedupe tests | **Pass** | `useCampaignSession` dedupes `prev.some((e) => e.eventId === event.eventId)`; dispatch dedupe in scripted suite |
| M9 | Operator journey without narration | scripted | Broken rule, responsible action, replay visible from UI/API fields alone | finding detail + API response fields | **Pass** | FindingDetail renders `invariantId`, `logicalActionId`, `replay.outcome` without narrative dependency |
| M10 | Live agents blocked | n/a | Live control disabled; no paid calls | UI setup + `ci:offline` live refuse | **Pass** | UI: "Enable live agents (blocked)" `disabled`; `RULEBREAK_LIVE_ENABLED=true npm run ci:offline` → exit 1 ("offline gate refuses live mode") |
| M11 | Fresh-checkout offline | scripted | Documented Verified / gate commands succeed without ambient credentials | `npm run ci:offline` | **Pass** | 2026-09-22 15:02 EDT: `ci:offline OK` @ `4aec200` — 57 passed / 5 todo + web build (Node 26.5.0 / npm 11.17.0) |
| M12 | Live dual-agent campaign | live | Blocked until G2–G4 | n/a | **Blocked** | Live RB-011 / dual-agent path not run (offline-only assign); G2–G4 not a live gate close |

## Negative controls

| ID | Attempt | Expected | Result | Evidence |
| --- | --- | --- | --- | --- |
| N1 | Treat bounded clean fixed run as “secure” | No green secure badge | **Pass** | FindingDetail `warnNote` + StatusPill `.blocked_as_expected` copper outline / transparent (no green); fixed path produces no finding |
| N2 | Model/story overrides invariant failure | Prefer verifier/replay fields | **Pass** | Scripted path; UI binds `violation` / `replay` contracts |
| N3 | Promote to `confirmed` without durable **confirming** replay write | Stay `candidate` | **Pass** | Fixed control alone leaves `candidate`; `tests/integration/confirm-promotion.test.ts` inside `ci:offline` |
| N3b | Persist `matched_violation` confirming replay | Become `confirmed` | **Pass** | `applyConfirmingReplay` + API start path (confirm-promotion suite) |
| N4 | Bundle secrets into `apps/web` | No operator token / API keys in src/dist | **Pass** | `rg` over `apps/web/src` + `dist` after `build:web` — no operator token / API key matches |

## Execution gate

- Draft + Results: this document (2026-09-22 15:02 EDT).  
- Offline re-verify against Candidate A on main `4aec200` after #28/#34/#37/#39.  
- Live rows remain **Blocked** (M12).  
- No Fail rows this pass.  
- Reviewers: @Engineer Overlord · @Product Manager Titan
