# Rulebreak — Task Board

Owner: Scrum Master Chronomancer  
Source: AGENTS.md §19 · mirrored on [GitHub Project #4](https://github.com/users/MarcoDotIO/projects/4)  
Updated: 2026-09-29 ~8:45 PM ET

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
| RB-015 v1 removal | #65 (`f8427a6`) — v1-only exports and tests removed; §8 and v1 snapshot kept as history; doc title covers v1 + v2 · #67 (`c23cbce`) contract doc follow-up |
| UI | Candidate A #28 shipped; night-market #24 reference-only |
| Spike honesty | Offline `spike:g2g4` **13/0/2** (G4-P3 + G4-P4 Not run) |

## In flight / next

| Item | Owner | Status | Notes |
| --- | --- | --- | --- |
| RB-018 offline `reward_claim` explorer action | Backend Architect Wizard (tool boundary), Engineer Overlord (`seeded_random` wiring) | Next | Wizard writes the tool-boundary contract and the security-policy line first, then EO wires it. Acceptance: see Parked (P1) entry below, now promoted |
| A: AgenC dual-session gap | — | Parked | Needs real AgenC dual sessions and an acceptance line; waits on Marco's spend decision |
| Pitch-caps finding-status pills | UI Design Goblin | Optional | `candidate` / `inconclusive` kinds still used for "not closed" / "Partial" / "Not run"; display-only follow-up, not scheduled |

## Parked (P1)

- **RB-018 offline `reward_claim` explorer action** — **Next** (promoted after RB-016 Done; see In flight). Owners: Backend Architect Wizard (tool boundary), Engineer Overlord (`seeded_random` wiring). Acceptance: `seeded_random` can call `reward_claim` (reward id plus idempotency key, under the bound account, per `AGENTS.md`) against the local reward fixture only, so the reward-pair comparison reports `seeded_random` as a measured arm on faulty and fixed, not `not_run`. The tool stays off for live and LLM arms; the security policy gets an offline, fixture-only line; offline and $0; the trade pair's settings key is unchanged. Live or LLM use waits on Marco, like A.
- **RB-017 trace reduction** — after RB-018 (more useful once there are explorer-found traces to shrink).

## Coordination

- Local-only host (no cloud agents). Prefer `gh` for PR ops.  
- EO owns lockfile. SM owns `BOARD.md`. Titan mirrors Project #4.  
- Label live / scripted / mocked / recorded. Non-author review for verification / auth / replay.  
- Live provider: **Thor SSH networked LLM**; paid cloud **$0**.  
- UIs showing RB-015 rows must check `outcome` before `provenance` (`not_run` LLM rows carry `live`).  
- Open docs PR (Marco): #36 README / StreamBanner.  
- Demo frozen at `a1367e2`; only display-only follow-ups during the freeze.
