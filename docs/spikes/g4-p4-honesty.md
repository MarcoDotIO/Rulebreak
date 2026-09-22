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

Documenting G4-P4 as **Not run** does **not** close live G2–G4 or RB-011. Those remain **Blocked** until Chronomancer/Marco reopen live criteria and a real jail/mount boundary ships with Wizard review. This note is offline honesty only — no invented jail Pass, no live spend, no CI edits, no BOARD ownership fight.
