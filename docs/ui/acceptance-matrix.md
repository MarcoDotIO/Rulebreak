# RB-013 acceptance matrix (draft)

**Owner:** UI Design Goblin  
**Reviewer:** Engineer Overlord (E2E changes) · Product Manager Titan (AC coverage)  
**Status:** Draft — execute and record results after RB-012 CI is green  
**Depends on:** RB-009 (replay), RB-010/UI stream (#16), RB-012 (CI packaging)

## How to use this matrix

1. Label every run: `scripted` | `recorded` | `live` | `mocked`.
2. Record **Pass / Fail / Blocked / N/A** with command output or artifact path.
3. Do **not** mark durable `confirmed` unless the store write actually promotes after successful replay (still thin as of Archivist walk `0daf187`).
4. Independent challenge: Goblin must not be the sole reviewer of verifier/replay UI evidence they authored.

## Product AC coverage

| AC | Covered by | Notes |
| --- | --- | --- |
| AC-04 scripted slice | M1, M2 | Known failure + fixed clean |
| AC-06 offline replay | M3 | `matched_violation` on faulty |
| AC-07 regression export | M4 | Faulty red / fixed green |
| AC-08 honest negatives | M2, M5 | No false confirmed on fixed |
| AC-09 provenance labels | M6 | UI pills + stream banner |
| AC-10 campaign controls | M7, M8 | Stop + eventId dedupe |
| AC-12 UI evidence flow | M6, M9 | Setup → timeline → finding |
| AC-13 boundaries | M10 | Live agents blocked; no spend |
| AC-14 fresh-checkout | M11 | After RB-012 docs/CI |
| AC-11 live AgenC | M12 | **Out of pitch** until G2–G4 |

## Matrix

| ID | Scenario | Mode | Expected evidence | Run command / path | Result | Evidence link |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | Known trade-failure (faulty) | scripted | Finding present; `status: candidate` (until store promotion); `mode: scripted`; invariant INV-003 or INV-004; responsible `logicalActionId` visible in UI/API | `POST /api/campaigns` `{fixtureMode:"faulty"}` or UI Start | _pending_ | |
| M2 | Same script on fixed target | scripted | `outcome: no_violation_observed`; no finding; no vulnerable/secure badge | campaign API or `npm test -- tests/integration/scripted-campaign.test.ts` | _pending_ | |
| M3 | Offline replay on fresh faulty | recorded | `ReplayResult.outcome = matched_violation` | `npm test -- tests/integration/replay-regression.test.ts` | _pending_ | |
| M4 | Fixed-target control replay + export | recorded | `blocked_as_expected`; export bundle files present; legitimate trade still works | same suite + export path | _pending_ | |
| M5 | Legitimate trades on fixed | scripted | No conservation / uniqueness violation | economy unit + `legitimateTradeWorks()` | _pending_ | |
| M6 | UI provenance + finding detail | scripted | Banner ≠ MOCK; pills show scripted; finding shows invariant + action + replay outcome separately from status | `npm run dev:server` + `npm run dev:web` | _pending_ | |
| M7 | Stop mid-run | scripted | Terminal stop; further admissions refused | scripted-campaign stop test / UI Stop | _pending_ | |
| M8 | Reconnect / duplicate event ids | scripted | Timeline dedupes by `eventId` | UI stream + unit/integration | _pending_ | |
| M9 | Operator journey without narration | scripted | Operator can identify broken rule, responsible action, replay result from UI alone | Manual walk of three views | _pending_ | |
| M10 | Live agents blocked | n/a | Enable live agents control disabled; no paid provider calls | UI setup + server defaults | _pending_ | |
| M11 | Fresh-checkout offline | scripted | Documented Verified commands succeed without ambient credentials | After RB-012; follow README Verified table | _pending_ | |
| M12 | Live dual-agent campaign | live | **Blocked** until G2–G4 isolation evidence | n/a | Blocked | G2–G4 open |

## Negative controls (must remain Fail or Blocked)

| ID | Attempt | Expected |
| --- | --- | --- |
| N1 | Treat bounded clean fixed run as “secure” | UI must not show green secure badge |
| N2 | Model/story overrides invariant failure | Not applicable on scripted path; UI must prefer verifier/replay fields |
| N3 | Promote finding to `confirmed` without successful replay store write | Must stay `candidate` until durable promotion exists |
| N4 | Bundle secrets into `apps/web` | Build/grep: no operator token / API keys |

## Execution gate

- **Draft complete:** this document.  
- **Execute:** after @Engineer Overlord’s RB-012 is green on main.  
- **Record:** fill Result + Evidence link columns; attach failing logs honestly.
