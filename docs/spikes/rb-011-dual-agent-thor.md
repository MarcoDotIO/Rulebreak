# RB-011 — Dual-agent Thor campaign

**Status:** **Partial / In Progress** on packaging hosts without Thor DNS; **Done** only when Mac (or other Thor-reachable host) produces real dual-agent artifact (`labels.dualAgentEvidence=real_thor_dual_ollama_generate`).  
**Assignment:** Chronomancer → Engineer Overlord (dual-agent Thor → RB-011).  
**Reviewer asked:** Backend Architect Wizard (boundary bar).  
**Updated:** 2026-09-22 (ET)

## Honest labels

| Claim | Label |
| --- | --- |
| Provider | **Thor SSH** → networked **local** Ollama on `thor.atr.cs.kent.edu` |
| Agents | **Two** — `player-a` + `player-b`, distinct `agentId`s |
| Evidence shape | Per-agent Ollama `/api/generate` turn over SSH (not UI labels) |
| Paid cloud hard cap | **$0** |
| Enablement | `RULEBREAK_LIVE_ENABLED=true` required; **default refuse** |
| Secrets | `THOR_SSH_*` only in gitignored `rulebreak/.env` |
| SSH vs G4 | **SSH ≠ G4 containment** |
| G4-P3 / G4-P4 | **Not run** |
| Closed live pitch | **Not claimed** |
| RB-011 | **Done** iff real dual-agent Thor evidence; else **Partial / In Progress** |

## Wizard boundary bar (must hold)

1. `refuseLive` / spend labels honest  
2. Secrets only in gitignored `.env`  
3. SSH ≠ G4 containment  
4. Paid cloud **$0**  
5. No ambient key leakage (`ci:offline` refuses ambient `THOR_SSH_PASSWORD`)  
6. Dual-agent evidence is **runtime** (two LLM turns), not UI chrome alone  
7. Do **not** claim closed pitch / G4 Pass / jail Pass

## How to run (Marco's Mac)

```bash
# .env (gitignored) — never commit
# THOR_SSH_HOST=thor.atr.cs.kent.edu
# THOR_SSH_USER=marnett5
# THOR_SSH_PASSWORD=...
# RULEBREAK_LIVE_ENABLED=true
# optional: THOR_OLLAMA_MODEL=llama3:8b

npm run spike:thor-dual -- --dry-run   # mock SSH; no network
RULEBREAK_LIVE_ENABLED=true npm run spike:thor-dual   # real dual-agent Thor
```

Prior single-agent wiring smoke (still valid):

```bash
RULEBREAK_LIVE_ENABLED=true npm run spike:thor-live
```

## What “dual-agent evidence” means here

**Is:** two distinct runtime agents (`player-a`, `player-b`) each complete one Ollama generate turn on Thor via SSH; artifact records `agentId`, model, response preview, and honesty labels.

**Is not:** AgenC `spawnAgent`×2 (that remains offline **G2-P3**), G4 Pass, jail proof, or closed live discovery pitch. UI may enable **Thor dual-agent live provenance** after #48 (SSH≠G4 honesty chips; browser still does not SSH — CLI remains `spike:thor-dual`).

Scaffolding reused: `thor-ssh-lib` gate/SSH/redaction; actor pair naming from G2-P3 (`player-a` / `player-b`). Full AgenC dual sessions against a Thor tunnel are a follow-up if needed — this spike prefers the smallest real dual LLM path on Thor.

## Packaging-host note

This Grok Bot box cannot resolve `thor.atr.cs.kent.edu` (no Mac Shell `8034ddf0-…` this run). Dry-run + unit tests land here. **Mark RB-011 Done only after Mac real run** writes `docs/spikes/thor-dual-agent-artifact.json` with `status: Pass` and `dualAgentEvidence: real_thor_dual_ollama_generate`.

## Code

| Path | Role |
| --- | --- |
| `scripts/spikes/thor-dual-agent-lib.mjs` | Dual-agent campaign runner |
| `scripts/spikes/thor-dual-agent-campaign.mjs` | CLI + artifact writer |
| `scripts/spikes/thor-ssh-lib.mjs` | Shared gate / SSH / redact (from #44) |
| `tests/unit/thor-dual-agent.test.ts` | refuse / dry-run / mock Pass labels |
| `docs/spikes/thor-dual-agent-artifact.json` | Redacted evidence (gitignored if secret-tainted; committed only when redacted) |

Artifact must never contain the password.
