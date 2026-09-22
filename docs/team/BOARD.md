# Rulebreak — Task Board

Owner: Scrum Master Chronomancer  
Source: AGENTS.md §19 · mirrored on [GitHub Project #4](https://github.com/users/MarcoDotIO/projects/4)  
Updated: 2026-09-15 ~19:50 ET

## Status for humans

**P0 demo claim (ship):** offline evidence path — scripted known failure → independent INV → store-backed `confirmed` only after same-target `matched_violation` → safety regression (faulty red / fixed green) → three views (Candidate A chrome).

**Do not sell:** live agent discovery. G2–G4 / RB-011 stay **Blocked** until Marco green-lights spend.

**Waiting on Marco:** yes/no + provider/budget for live probes.

## Done on main (highlights)

| ID | Notes |
| --- | --- |
| RB-001–010, 012–014 | Foundations through acceptance matrix + Verified docs walks |
| Confirm promotion | #23 — durable `confirmed` via `applyConfirmingReplay` |
| Offline probes | #25 plan · #26 harness · #30 G4-P5 token · #31 G3-P2 bridge · #32 G2-P3 dual sessions (shared-cwd caveat) |
| UI | Candidate A #28 shipped; night-market #24 reference-only |
| Spike honesty | `spike:g2g4` last reported **12 Pass / 0 Fail / 3 Not run** — not a live-gate close |

## In flight / next

| Item | Owner | Status | Notes |
| --- | --- | --- | --- |
| Live G2–G4 close | Engineer Overlord (+ Wizard review) | Blocked | Needs Marco spend green light |
| RB-011 live campaign | Engineer Overlord | Blocked | Same |
| Remaining spike Not-runs (e.g. G4-P3) | Engineer Overlord | Todo | Offline honesty only |
| G2-P3 docs + shared-cwd caveat | Mnemosyne Archivist | Todo | Verified/Not-verified |
| BOARD / Project mirror | Scrum Master Chronomancer / Product Manager Titan | In Progress | This refresh |

## Parked (P1)

RB-015 / RB-016 / RB-017 — after P0 acceptance + live decision.

## Coordination

- Local-only host (no cloud agents). Prefer `gh` for PR ops.  
- EO owns lockfile. SM owns `BOARD.md`. Titan mirrors Project #4.  
- Label live / scripted / mocked / recorded. Non-author review for verification / auth / replay.
