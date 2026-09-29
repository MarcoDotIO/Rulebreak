# Rulebreak — Task Board

Owner: Scrum Master Chronomancer  
Source: AGENTS.md §19 · mirrored on [GitHub Project #4](https://github.com/users/MarcoDotIO/projects/4)  
Updated: 2026-09-29 ~6:50 PM ET

## Status for humans

**P0 demo claim (ship):** offline evidence path — scripted known failure → independent INV → store-backed `confirmed` only after same-target `matched_violation` → safety regression (faulty red / fixed green) → three views (Candidate A chrome).

**Demo freeze (C): Done.** Frozen at main `a1367e2` (#48, #50, #51). Pitch-limitations page shipped in #52 (`5a3ee4b`): nine honesty caps, none shown as a Pass, pitch not closed, nothing labelled secure. Display-only; no runtime or API change. #54 (`fba0751`) moved the demo-center pill to a `neutral` kind; copy unchanged. B does not touch the frozen demo.

**Live path (evidence Done, pitch not closed):** Thor SSH networked LLM only. Paid cloud hard cap **$0**. SSH ≠ G4 containment. Secrets stay in gitignored `.env` (never in BOARD/artifacts/chat). Browser never SSHs; password never leaves the server as more than a boolean.

**RB-011 evidence:** #48 — dual-agent Thor Mac Pass. **rb011 Done**; pitch **not** closed; not AgenC dual sessions.

**UI-DUAL:** #50 @ `552193b` — **Done**. Live provenance + dual-agent enablement on Candidate A. **M13 = Partial-on-UI-SSH** (right grade). Unlock ≠ closed pitch; SSH≠G4; G4 Not run.

**Do not sell:** live agent discovery as a closed / contained pitch. Offline G4-P3 + G4-P4 stay **Not run**.

**RB-015 v1 seeded baseline (B): Done.** Contract #56 (Wizard), offline runner #58 (EO) squashed as main `047715a`; results from code commit `72f47af`. 20/20 planned runs, `validateComparison` clean. `scripted_known` and `seeded_random` each confirmed INV-003 on 5/5 faulty runs (median 3 and 83 actions); 0/5 clean-target false confirmations each, which is **guaranteed by how the fixed fixture is built, not a measured rate**. `llm_single` / `llm_dual` are `not_run` (live gate not approved), not zero-finding results. Offline only, $0, synthetic fixture with one planted defect; not evidence of general exploit detection. Thor runs are not `llm_dual`. G4 Not run; pitch not closed.

**Next: RB-015-v2 (offline, $0).** Wizard updates the contract first (`not_reproduced` outcome, wall-time cutoff flag, `toolAccess` vs arm check, benchmark tables in the evidence store), then EO updates the runner. Same review path as v1.

**Parked: (A)** AgenC dual-session gap — no acceptance line written yet.

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
| UI | Candidate A #28 shipped; night-market #24 reference-only |
| Spike honesty | Offline `spike:g2g4` **13/0/2** (G4-P3 + G4-P4 Not run) |

## In flight / next

| Item | Owner | Status | Notes |
| --- | --- | --- | --- |
| RB-015-v2 contract + runner | Backend Architect Wizard (contract), Engineer Overlord (runner) | Next | `not_reproduced`, wall-time flag, `toolAccess` check, benchmark tables; offline, $0 |
| A: AgenC dual-session gap | — | Parked | Open-ended; needs real AgenC dual sessions and an acceptance line |
| Pitch-caps finding-status pills | UI Design Goblin | Optional | `candidate` / `inconclusive` kinds still used for "not closed" / "Partial" / "Not run"; display-only follow-up, not scheduled |

## Parked (P1)

RB-016 / RB-017.

## Coordination

- Local-only host (no cloud agents). Prefer `gh` for PR ops.  
- EO owns lockfile. SM owns `BOARD.md`. Titan mirrors Project #4.  
- Label live / scripted / mocked / recorded. Non-author review for verification / auth / replay.  
- Live provider: **Thor SSH networked LLM**; paid cloud **$0**.  
- UIs showing RB-015 rows must check `outcome` before `provenance` (`not_run` LLM rows carry `live`).  
- Open docs PR (Marco): #36 README / StreamBanner.  
- Demo frozen at `a1367e2`; only display-only follow-ups during the freeze.
