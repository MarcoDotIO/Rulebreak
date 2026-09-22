# G2–G4 OS inventory (honesty sheet)

**Probe:** G4-P7  
**Status:** Documented limitations — **not** a live isolation claim  
**Host:** Marco’s Mac (local-only; no cloud agents)  
**Date:** 2026-09-15 (G4-P4 honesty reinforce 2026-09-22)  
**Author:** Engineer Overlord

## Honesty

This sheet records what we **observe or reasonably infer** about the current demo/runtime layout. It does **not** prove containment. Empty or “unknown” cells are better than invented Pass.

**G4-P4 remains Not run.** Filling this inventory (G4-P7 Pass) is documentation only — it is **not** filesystem / mount-boundary proof and must never be graded as a G4-P4 Pass.

## Recorded environment

| Question | Answer | Evidence / how checked |
| --- | --- | --- |
| Does the explorer MCP process run as the same OS user as the repo checkout? | **Yes (assumed / typical)** | `rulebreak-mcp-player.mjs` is spawned via stdio from the host Node process (`scripts/spikes/*`) with no jail wrapper |
| Is the Rulebreak source tree mounted / readable from the MCP child? | **Yes** | Child inherits cwd/env; no chroot/container/bubblewrap/seatbelt in spike path |
| Is `.env` / evidence SQLite reachable from explorer tooling? | **Likely yes if paths known** | No FS allowlist in MCP bridge; tools don’t expose arbitrary read yet, but process has OS read |
| Docker socket present for worker? | **Unknown / not required for scripted demo** | Not probed in automation; do not claim absence |
| SSH agent forwarded into worker? | **Unknown** | Not probed |
| Open egress from worker to public internet? | **Host network (typical)** | Spike/MCP child uses host network; no network namespace isolation implemented |
| Separate `AGENC_HOME` per actor? | **Yes (layout)** | `.rulebreak/agenc-home-player-a` and `...-player-b` used in RB-003 notes + offline probe stubs |
| Operator HTTP reachable without token? | **No for mutations (when token configured)** | `requireOperator` on `POST /api/campaigns` and `.../stop` → 401 without header; 503 if `RULEBREAK_OPERATOR_TOKEN` unset. Vite proxy injects token for local UI. |
| In-repo worker jail / reduced mount set? | **No** | No `packages/worker-jail` (or equivalent) on main; G4-P4 stays **Not run** — see `docs/spikes/g4-p4-honesty.md` |

## Reduced claim (demo-local only)

Loopback **scripted** demo remains valid. Effective OS denial (G4-P4 / full G4) is **unproven**. Do not put live agent discovery in the pitch.

Policy enums such as `arbitrary_filesystem` / `evidence_store_mount` under `EXPLORER_DENIED_CAPABILITIES` record **intent**, not an enforced OS mount boundary.

## Next hardening (when Marco green-lights)

1. ~~Enforce operator token on control API~~ (G4-P5 — landed).
2. Worker jail or reduced mount set; re-run G4-P4 with negative transcripts (only then may grader move Not run → Partial pending Wizard review — **never** invent Pass from this sheet).
3. Optional: network egress policy for live workers only after G2–G3 Pass.
