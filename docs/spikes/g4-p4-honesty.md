# G4-P4 honesty (offline)

**Status:** G4-P4 remains **Not run** on the offline rollup (**13 / 0 / 2**).

## Why Not run (not Pass)

G4-P4 is the **filesystem / mount-boundary** probe: from an explorer worker, attempt read of repo source / `.env` / evidence DB and show **effective denial** (or prove the path is not mounted into the worker). See `docs/security/g2-g4-isolation-probe-plan.md` G4-P4.

Today there is **no in-repo worker jail or reduced mount set**. Spike/MCP children inherit the host cwd/env (`docs/spikes/g2-g4-os-inventory.md`). The offline grader (`scripts/spikes/g2-g4-offline-probes.mjs` → `gradeG4P4`) therefore:

1. Returns **Not run** when no jail/mount module exists and/or no negative FS-denial artifact is present.
2. May return **Partial** only if a future PR lands real jail wiring **and** a negative transcript — still **not** a G4 FS Pass.
3. **Never** upgrades G4-P4 to **Pass** from OS inventory alone, from policy `DeniedCapability` enums, or from G4-P7 documentation Pass.

## What is not a jail Pass

| Signal | What it actually is | Not G4-P4 for |
| --- | --- | --- |
| `docs/spikes/g2-g4-os-inventory.md` (G4-P7 Pass) | Honesty sheet of observed layout / unknowns | Effective FS denial |
| `arbitrary_filesystem` / `evidence_store_mount` in `EXPLORER_DENIED_CAPABILITIES` | App-level policy intent (RB-004) | OS jail / mount boundary |
| Separate `AGENC_HOME` per actor (G2) | Session/home isolation layout | Source-tree unmount |
| G2-P3 shared-cwd caveat | Sessions ≠ FS isolation (already documented) | Worker jail |

## Live gates

Documenting G4-P4 as **Not run** does **not** close live G2–G4 or RB-011, and does **not** prove containment on Thor. Chronomancer opened live work on **Thor SSH networked LLM** with paid cloud hard cap **$0**; SSH ≠ G4 containment. Secrets stay in gitignored `.env`. This note stays offline honesty only — no invented jail Pass, no secrets in docs, no BOARD ownership fight.

## Archivist verification

**Verified** (Mnemosyne Archivist, 2026-09-22 ~3:14 PM ET, tip `d85b9f4` / #42 on main):

| Check | Result |
| --- | --- |
| In-repo worker jail / mount module | **Absent** (grader candidate paths not present) |
| Negative FS-denial artifact | **Absent** |
| G4-P7 OS inventory | Present — documentation only, not FS denial |
| `scripts/spikes/g4-p4-grade.mjs` | Refuses **Pass** without jail + negative transcript; max offline upgrade is **Partial** |
| Rollup claim | **Not run** — honesty Done; **not** a jail Pass |

Do **not** pitch G4-P4 as Pass from OS inventory or policy enums.
