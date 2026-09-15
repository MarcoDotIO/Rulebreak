# RB-013 acceptance matrix

**Owner:** UI Design Goblin  
**Reviewer:** Engineer Overlord (E2E changes) · Product Manager Titan (AC coverage)  
**Status:** Results recorded 2026-09-15 18:32 EDT  
**Gate:** `npm run ci:offline` → **OK** (v26.5.0 / 11.17.0) — 48 tests passed / 5 todo + web build; live + ambient secrets refused  
**Depends on:** RB-009, UI stream (#16), RB-012 — **satisfied on main**

## How to use this matrix

1. Label every run: `scripted` | `recorded` | `live` | `mocked`.
2. Record **Pass / Fail / Blocked / N/A** with command output or artifact path.
3. Do **not** mark durable `confirmed` unless the store write actually promotes after successful replay (still thin).
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
| M1 | Known trade-failure (faulty) | scripted | Finding `candidate` + `scripted`; INV-003/004; responsible action id | `POST /api/campaigns` `{fixtureMode:"faulty"}` | **Pass** | 2026-09-15 18:32 EDT: `violation_candidate`, finding `candidate`/`scripted`/`INV-003`, control replay `blocked_as_expected` |
| M2 | Same script on fixed target | scripted | No finding; no vulnerable/secure badge | `npm test -- tests/integration/scripted-campaign.test.ts` | **Pass** | Inside `ci:offline` — fixed path `no_violation_observed` (5/5 file) |
| M3 | Offline replay on fresh faulty | recorded | `matched_violation` | `npm test -- tests/integration/replay-regression.test.ts` | **Pass** | Inside `ci:offline` — 3/3 |
| M4 | Fixed-target control replay + export | recorded | `blocked_as_expected`; export bundle; legitimate trade works | same suite | **Pass** | Inside `ci:offline` — export + legitimateTradeWorks |
| M5 | Legitimate trades on fixed | scripted | No conservation / uniqueness violation | economy unit + `legitimateTradeWorks()` | **Pass** | Inside `ci:offline` (economy + replay suites) |
| M6 | UI provenance + finding detail | scripted | Banner ≠ MOCK; scripted pills; invariant + action + replay separate from status | code review of `apps/web` on main + API smoke | **Pass** | StreamBanner + finding stays `candidate` with separate replay outcome; API smoke above |
| M7 | Stop mid-run | scripted | Terminal stop; further admissions refused | scripted-campaign stop test | **Pass** | Inside `ci:offline` scripted-campaign suite |
| M8 | Reconnect / duplicate event ids | scripted | Timeline dedupes by `eventId` | UI `useCampaignSession` + scripted dedupe tests | **Pass** | Dedupe by `eventId` in hook; dispatch dedupe tests in scripted suite |
| M9 | Operator journey without narration | scripted | Broken rule, responsible action, replay visible from UI/API fields alone | finding detail + API response fields | **Pass** | `invariantId`, `logicalActionId`, `replay.outcome` present without narrative dependency |
| M10 | Live agents blocked | n/a | Live control disabled; no paid calls | UI setup + `ci:offline` live refuse | **Pass** | "Enable live agents (blocked)" disabled; `RULEBREAK_LIVE_ENABLED=true npm run ci:offline` exits non-zero |
| M11 | Fresh-checkout offline | scripted | Documented Verified / gate commands succeed without ambient credentials | `npm run ci:offline` | **Pass** | `ci:offline OK` on this host 2026-09-15 18:32 EDT |
| M12 | Live dual-agent campaign | live | Blocked until G2–G4 | n/a | **Blocked** | G2–G4 isolation still open |

## Negative controls

| ID | Attempt | Expected | Result | Evidence |
| --- | --- | --- | --- | --- |
| N1 | Treat bounded clean fixed run as “secure” | No green secure badge | **Pass** | FindingDetail warnNote + fixed path produces no finding |
| N2 | Model/story overrides invariant failure | Prefer verifier/replay fields | **Pass** | Scripted path; UI binds `violation` / `replay` contracts |
| N3 | Promote to `confirmed` without durable **confirming** replay write | Stay `candidate` | **Pass** | Fixed control alone leaves `candidate`; see `tests/integration/confirm-promotion.test.ts` |
| N3b | Persist `matched_violation` confirming replay | Become `confirmed` | **Pass** | `applyConfirmingReplay` + API start path |
| N4 | Bundle secrets into `apps/web` | No operator token / API keys in src/dist | **Pass** | `rg` over `apps/web/src` + `dist` — no operator token / API key matches |

## Execution gate

- Draft + Results: this document (2026-09-15 18:32 EDT).  
- Live rows remain **Blocked**.  
- Reviewers: @Engineer Overlord · @Product Manager Titan
