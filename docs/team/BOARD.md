# Rulebreak — Task Board

Owner: Scrum Master Chronomancer  
Source: AGENTS.md §19 · mirrored on [GitHub Project #4](https://github.com/users/MarcoDotIO/projects/4)  
Updated: 2026-09-22 ~3:28 PM ET

## Status for humans

**P0 demo claim (ship):** offline evidence path — scripted known failure → independent INV → store-backed `confirmed` only after same-target `matched_violation` → safety regression (faulty red / fixed green) → three views (Candidate A chrome).

**Live path (opened, not closed):** Thor SSH networked LLM only. Paid cloud hard cap **$0**. SSH ≠ G4 containment. Secrets stay in gitignored `.env` (never in BOARD/artifacts/chat).

**Thor wiring evidence:** Mac smoke `RULEBREAK_LIVE_ENABLED=true npm run spike:thor-live` **Pass** (SSH + Ollama tags) after #44 @ `8b1679b`. That is **wiring only** — RB-011 stays **In Progress**, not a closed live pitch.

**Do not sell:** live agent discovery as a closed / contained pitch. Offline G4-P3 + G4-P4 stay **Not run**.

**Waiting on Marco:** none for provider / $0 / Thor smoke. Still awaiting campaign + M12 UI evidence before any closed live pitch.

## Done on main (highlights)

| ID | Notes |
| --- | --- |
| RB-001–010, 012–014 | Foundations through acceptance matrix + Verified docs walks |
| Confirm promotion | #23 — durable `confirmed` via `applyConfirmingReplay` |
| Offline probes | #25 plan · #26 harness · #30 G4-P5 token · #31 G3-P2 bridge · #32 G2-P3 dual sessions (shared-cwd caveat) · #37 G3-P3 true bound observe Pass |
| G2-P3 Verified docs | #34 — Verified offline walk + shared-cwd caveat |
| G4-P3 honesty | #39 / BOARD #40 — Done as **Not run** (empty `callbackLog` / bypass); spike labels ≠ G4 |
| G4-P4 honesty | #42 — Done as **Not run** (OS inventory ≠ jail Pass); grader refuses Pass without jail + negative transcript |
| Offline RB-013 matrix | #41 @ `1f013df` — M1–M11+N1–N4 Pass; M12 was Blocked pending Thor (Goblin now claimed M12 live UI) |
| Thor live wiring | #44 @ `8b1679b` — refuse-by-default SSH probe; Mac smoke Pass as **wiring only** |
| UI | Candidate A #28 shipped; night-market #24 reference-only |
| Spike honesty | `spike:g2g4` last reported **13 Pass / 0 Fail / 2 Not run** (G4-P3 + G4-P4 Not run) — not a live-gate close |

## In flight / next

| Item | Owner | Status | Notes |
| --- | --- | --- | --- |
| Live G2–G4 close (Thor SSH) | Engineer Overlord (+ Wizard) | In Progress | Wiring smoke Pass; not closed; SSH ≠ G4; paid $0 |
| RB-011 live campaign | Engineer Overlord | In Progress | Same bar — do **not** mark Pass until campaign evidence |
| M12 live UI acceptance | UI Design Goblin | In Progress | Candidate A live-enabled UI; no secure badge; SSH ≠ G4 |
| Thor boundary follow-up | Backend Architect Wizard | Free | Smoke accepted as wiring; standing by for next PR |
| BOARD / Project mirror | Scrum Master Chronomancer / Product Manager Titan | In Progress | This reconcile vs Project #4 |

## Parked (P1)

RB-015 / RB-016 / RB-017 — after P0 acceptance + live campaign evidence.

## Coordination

- Local-only host (no cloud agents). Prefer `gh` for PR ops.  
- EO owns lockfile. SM owns `BOARD.md`. Titan mirrors Project #4.  
- Label live / scripted / mocked / recorded. Non-author review for verification / auth / replay.  
- Live provider: **Thor SSH networked LLM**; paid cloud **$0**. Smoke: `RULEBREAK_LIVE_ENABLED=true npm run spike:thor-live`.
