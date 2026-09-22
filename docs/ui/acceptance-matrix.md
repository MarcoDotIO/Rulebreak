# RB-013 acceptance matrix

**Owner:** UI Design Goblin  
**Reviewer:** Engineer Overlord (E2E changes) · Product Manager Titan (AC coverage)  
**Status:** M13 dual-agent UI unlock recorded 2026-09-22 ~15:55 EDT (M1–M11 retained; M12 historical labels Pass retained; M13 adds enablement)  
**Gate:** Prefer `npm run typecheck` + web typecheck + `thor-capabilities` unit; `ci:offline` when feasible (refuses live + ambient secrets)  
**Main SHA:** `880e243` (post #48 RB-011 dual-agent Thor evidence Done; pitch not closed)  
**Host note:** Grok Bot box worktree `rulebreak-wt/rb-ui-dual-agent` from `origin/main`. Mac machineId Shell **not available** this run. No `.env` secrets read or committed.  
**Depends on:** RB-009, UI stream (#16), RB-012, Candidate A (#28), Thor wiring (#44), dual-agent Thor evidence (#48), M12 labels (#46) — **satisfied on main**  
**Candidate A visual:** StreamBanner · copper `blocked_as_expected` · provenance pills · three views — **intact**; live provenance unlock uses Thor honesty chips (SSH≠G4 / paid $0 / pitch not closed)  
**README caveat:** open PR #36 docs-only — **do not touch**. **Do not claim** closed pitch or G4 Pass. RB-011 evidence Done ≠ closed pitch.

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
| AC-13 boundaries | M10, M13 | Live gated to Thor path / #48 evidence; no paid spend; browser does not SSH |
| AC-14 fresh-checkout | M11 | `ci:offline` / Verified README commands |
| AC-11 live AgenC | M12, M13 | M12 = Thor CLI + labels; M13 = Thor dual-agent UI enablement + live provenance (not AgenC dual sessions; pitch not closed; SSH≠G4) |

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
| M10 | Live agents gated | n/a | Enablement locked without Thor path / #48 evidence; no paid calls | UI setup + capabilities + `ci:offline` live refuse | **Pass (gated)** | 2026-09-22 ~15:55 EDT @ `880e243`+: button locked unless `thorDualAgent.canEnableLiveAgents`; `ci:offline` still refuses `RULEBREAK_LIVE_ENABLED=true`; paid cloud $0; browser never SSHes |
| M11 | Fresh-checkout offline | scripted | Documented Verified / gate commands succeed without ambient credentials | `npm run ci:offline` | **Pass** | 2026-09-22 15:02 EDT: `ci:offline OK` @ `4aec200` — 57 passed / 5 todo + web build (Node 26.5.0 / npm 11.17.0) |
| M12 | Live dual-agent campaign (labels era) | live | Honest live labels; historical dual-agent UI blocked bar; Thor CLI ≠ pitch close; SSH≠G4 | retained from #46 @ `8b1679b` | **Pass (Thor live UI labels; SSH≠G4)** | Historical #46 evidence retained. Superseded for enablement by **M13** after #48. Still: no green “secure”; SSH≠G4; pitch not closed. |
| M13 | Dual-agent UI enablement (Thor) | live | Enable Thor dual-agent live provenance when capabilities allow; distinguish Thor SSH player-a/player-b from AgenC dual sessions; banner/notes SSH≠G4 / $0 / pitch not closed; G4 Not run; control-API campaigns remain scripted | code + `/api/health.thorDualAgent` + unit `thor-capabilities` @ `880e243` worktree | **Pass (Partial on live SSH from UI)** | 2026-09-22 ~15:55 EDT: (1) `getThorDualAgentCapabilities` — enable when live gate+password **or** #48 Pass artifact; never returns password. (2) CampaignSetup unlocks “Enable Thor dual-agent (SSH≠G4)”; provenance → `live` with Thor copy; honesty chips SSH≠G4 / paid $0 / pitch not closed. (3) StreamBanner live-agents branch names Thor SSH dual-agent, not AgenC. (4) FindingDetail separates campaign mode vs UI provenance; limitations + warnNote deny G4 Pass / closed pitch / green secure. (5) Browser does **not** run Thor SSH (CLI remains `spike:thor-dual`). **Not** closed pitch · **Not** G4 Pass · **Not** AgenC dual sessions. |

## Negative controls

| ID | Attempt | Expected | Result | Evidence |
| --- | --- | --- | --- | --- |
| N1 | Treat bounded clean fixed run as “secure” | No green secure badge | **Pass** | FindingDetail `warnNote` + StatusPill `.blocked_as_expected` copper outline / transparent (no green); fixed path produces no finding |
| N2 | Model/story overrides invariant failure | Prefer verifier/replay fields | **Pass** | Scripted path; UI binds `violation` / `replay` contracts |
| N3 | Promote to `confirmed` without durable **confirming** replay write | Stay `candidate` | **Pass** | Fixed control alone leaves `candidate`; `tests/integration/confirm-promotion.test.ts` inside `ci:offline` |
| N3b | Persist `matched_violation` confirming replay | Become `confirmed` | **Pass** | `applyConfirmingReplay` + API start path (confirm-promotion suite) |
| N4 | Bundle secrets into `apps/web` | No operator token / API keys in src/dist | **Pass** | `rg` over `apps/web/src` + `dist` after `build:web` — no operator token / API key matches |

## Execution gate

- Draft + Results: this document (M1–M11 @ 2026-09-22 15:02 EDT; **M12** @ 15:35 EDT; **M13** @ ~15:55 EDT).  
- Main base for M13: `880e243` (#48 dual-agent Thor evidence Done; pitch not closed).  
- M12 retained as labels-era Pass; M13 unlocks Thor dual-agent UI enablement + live provenance (Partial: UI does not SSH).  
- Non-claims: closed pitch · G4 Pass · jail Pass · AgenC dual sessions from this UI.  
- No Fail rows this pass.  
- Reviewers: @Engineer Overlord · @Product Manager Titan · Backend Architect Wizard (Thor boundary bar)
