# Rulebreak — Task Board

Owner: Scrum Master Chronomancer  
Source: AGENTS.md §19 · mirrored on [GitHub Project #4](https://github.com/users/MarcoDotIO/projects/4)  
Updated: 2026-09-29 ~9:40 PM ET

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

**Next: RB-017 bounded trace reduction.** Owners: Engineer Overlord (build), Backend Architect Wizard (replay-boundary review), Mnemosyne Archivist (wording). Acceptance (Titan): inputs are the 5 confirmed `seeded_random` faulty traces from `rb-018-reward-offline-v1`, with the 4-action `scripted_known` trace only as a labelled control; the reducer removes action ranges within a set bound and replays from the original starting state after every attempt, with no model calls, offline and $0, capped at 100 replay attempts plus an explicit timeout; a reduction counts only if the independent verifier confirms the same INV-006 violation with the same actor bindings, referenced objects and stable IDs (a failing precondition or missing setup object is not reduced); the original trace is kept byte-for-byte beside the reduced one; results say "reduced", never minimal, report original length, reduced length and attempts per trace with the untuned-seeds caveat, and no average or rate; RB-015, RB-016 and RB-018 artifacts stay byte-identical.

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
| RB-015 v1 removal | #65 (`f8427a6`) — v1-only exports and tests removed; §8 and v1 snapshot kept as history; doc title covers v1 + v2 · #67 (`c23cbce`) contract doc follow-up |
| UI | Candidate A #28 shipped; night-market #24 reference-only |
| Spike honesty | Offline `spike:g2g4` **13/0/2** (G4-P3 + G4-P4 Not run) |

## In flight / next

| Item | Owner | Status | Notes |
| --- | --- | --- | --- |
| RB-017 bounded trace reduction | Engineer Overlord (build); Backend Architect Wizard (replay boundary); Mnemosyne Archivist (wording) | Next | Acceptance in Status (Titan): 5 `seeded_random` faulty traces from `rb-018-reward-offline-v1`, scripted as labelled control; ≤100 replay attempts + timeout; same-violation verifier check; original kept; "reduced", never minimal |
| A: AgenC dual-session gap | — | Parked | Needs real AgenC dual sessions and an acceptance line; waits on Marco's spend decision |
| Pitch-caps finding-status pills | UI Design Goblin | Optional | `candidate` / `inconclusive` kinds still used for "not closed" / "Partial" / "Not run"; display-only follow-up, not scheduled |

## Parked (P1)

- None right now. RB-018 is Done and RB-017 is Next (see Status); A is parked above.

## Coordination

- Local-only host (no cloud agents). Prefer `gh` for PR ops.  
- EO owns lockfile. SM owns `BOARD.md`. Titan mirrors Project #4.  
- Label live / scripted / mocked / recorded. Non-author review for verification / auth / replay.  
- Live provider: **Thor SSH networked LLM**; paid cloud **$0**.  
- UIs showing RB-015 rows must check `outcome` before `provenance` (`not_run` LLM rows carry `live`).  
- Open docs PR (Marco): #36 README / StreamBanner.  
- Demo frozen at `a1367e2`; only display-only follow-ups during the freeze.
