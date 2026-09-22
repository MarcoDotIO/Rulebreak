# Rulebreak — Task Board

Owner: Scrum Master Chronomancer  
Source: AGENTS.md §19 · mirrored on [GitHub Project #4](https://github.com/users/MarcoDotIO/projects/4)  
Updated: 2026-09-22 ~3:50 PM ET

## Status for humans

**P0 demo claim (ship):** offline evidence path — scripted known failure → independent INV → store-backed `confirmed` only after same-target `matched_violation` → safety regression (faulty red / fixed green) → three views (Candidate A chrome).

**Live path (evidence Done, pitch not closed):** Thor SSH networked LLM only. Paid cloud hard cap **$0**. SSH ≠ G4 containment. Secrets stay in gitignored `.env` (never in BOARD/artifacts/chat).

**RB-011 evidence:** #48 @ `b238e88` — dual-agent Thor Mac Pass (`player-a` / `player-b` Ollama generate over SSH). Labels: **rb011 Done**, pitch **not** closed, SSH≠G4, G4-P3/P4 **Not run**, paid $0. **Not** AgenC dual sessions (those remain offline G2-P3).

**Thor wiring:** #44 Mac smoke Pass — wiring only.  
**M12 UI:** #46 — Thor live UI **labels** Pass + SSH≠G4 only.

**Do not sell:** live agent discovery as a closed / contained pitch. Offline G4-P3 + G4-P4 stay **Not run**.

**Waiting on Marco:** none for provider / $0 / Thor evidence. Closed live pitch still **not** claimed.

## Done on main (highlights)

| ID | Notes |
| --- | --- |
| RB-001–010, 012–014 | Foundations through acceptance matrix + Verified docs walks |
| Confirm promotion | #23 — durable `confirmed` via `applyConfirmingReplay` |
| Offline probes | #25 plan · #26 harness · #30 G4-P5 · #31 G3-P2 · #32 G2-P3 · #37 G3-P3 true bound observe Pass |
| G2-P3 Verified docs | #34 — Verified offline walk + shared-cwd caveat |
| G4-P3 honesty | #39 / #40 — Done as **Not run** |
| G4-P4 honesty | #42 — Done as **Not run** (OS inventory ≠ jail Pass) |
| Offline RB-013 matrix | #41 — M1–M11+N1–N4 Pass |
| Thor live wiring | #44 — refuse-by-default SSH probe; Mac smoke Pass as wiring only |
| M12 live UI acceptance | #46 — labels / SSH≠G4 only |
| RB-011 dual-agent Thor | #48 — evidence Done; pitch not closed; not AgenC dual sessions |
| Live G2–G4 (Thor evidence) | #48 — Done on dual-agent evidence bar; **not** a closed pitch |
| UI | Candidate A #28 shipped; night-market #24 reference-only |
| Spike honesty | Offline `spike:g2g4` **13 Pass / 0 Fail / 2 Not run** (G4-P3 + G4-P4) — not a live-gate close |

## In flight / next

| Item | Owner | Status | Notes |
| --- | --- | --- | --- |
| Dual-agent UI (live provenance + enablement) | UI Design Goblin | In Progress | Chronomancer unlock granted; no closed-pitch claim; SSH≠G4; not AgenC dual sessions |
| Thor boundary follow-up | Backend Architect Wizard | Free | Standing by for Goblin’s UI PR |
| BOARD / Project mirror | Scrum Master Chronomancer / Product Manager Titan | In Progress | Project #4 already shows RB-011 + Live G2–G4 Done — this BOARD catch-up |

## Parked (P1)

RB-015 / RB-016 / RB-017 — after P0 acceptance + any closed-pitch decision.

## Coordination

- Local-only host (no cloud agents). Prefer `gh` for PR ops.  
- EO owns lockfile. SM owns `BOARD.md`. Titan mirrors Project #4.  
- Label live / scripted / mocked / recorded. Non-author review for verification / auth / replay.  
- Live provider: **Thor SSH networked LLM**; paid cloud **$0**.  
- Spikes: `npm run spike:thor-live` · `npm run spike:thor-dual` · docs `rb-011-dual-agent-thor.md`.
