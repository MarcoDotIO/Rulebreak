# RB-011 — Thor SSH live-ish path (G2–G4)

**Status:** **In Progress** (wiring + refuse-by-default). **Not** a closed live pitch.  
**Assignment:** Chronomancer → Engineer Overlord (live-ish G2–G4 on Thor).  
**Reviewer asked:** Backend Architect Wizard (Thor boundary bar).  
**Updated:** 2026-09-22 (ET)

## Honest labels

| Claim | Label |
| --- | --- |
| Provider | **Thor SSH** → networked **local** LLM on `thor.atr.cs.kent.edu` |
| Paid cloud hard cap | **$0** |
| Enablement | `RULEBREAK_LIVE_ENABLED=true` required; **default refuse** |
| Secrets | `THOR_SSH_*` only in gitignored `rulebreak/.env` |
| SSH vs G4 | **SSH ≠ G4 containment** |
| G4-P3 | **Not run** |
| G4-P4 | **Not run** |
| M12 / RB-011 | **In Progress** — not closed pitch |

## Wizard boundary bar (must hold)

1. `refuseLive` / spend labels honest  
2. Secrets only in gitignored `.env`  
3. SSH ≠ G4 containment  
4. Paid cloud **$0**  
5. No ambient key leakage (`ci:offline` refuses ambient `THOR_SSH_PASSWORD` in process env)

## How to run (Marco's Mac)

```bash
# .env (gitignored) — never commit
# THOR_SSH_HOST=thor.atr.cs.kent.edu
# THOR_SSH_USER=marnett5
# THOR_SSH_PASSWORD=...
# RULEBREAK_LIVE_ENABLED=true

npm run spike:thor-live -- --dry-run   # mock SSH; no network
RULEBREAK_LIVE_ENABLED=true npm run spike:thor-live   # real SSH + remote LLM probe
```

Default remote LLM probe (override with `THOR_LLM_PROBE_CMD`):

```text
curl -sS --max-time 30 http://127.0.0.1:11434/api/tags
```

## What this is / is not

**Is:** enablement path + SSH client wiring for a live-ish model call against Thor’s local LLM at **$0** paid cloud spend.

**Is not:** G4 Pass, jail proof, OS mount denial, or RB-011 pitch close. Offline rollup G4-P3/P4 remain **Not run**.

## Packaging-host note

If Thor is unreachable from a packaging / CI host, dry-run + mocked unit tests still land. **Connectivity must be verified on Marco’s Mac** with `.env` present.

## Code

| Path | Role |
| --- | --- |
| `scripts/spikes/thor-ssh-lib.mjs` | dotenv load, config, gate, SSH exec (ASKPASS; password not on argv) |
| `scripts/spikes/thor-live-probe.mjs` | CLI; refuse-by-default; artifact writer |
| `tests/unit/thor-live-probe.test.ts` | refuse / dry-run mock / no password leakage |
| `.env.example` | empty `THOR_SSH_*` placeholders |

Artifact (when probe runs): `docs/spikes/thor-live-artifact.json` — must never contain the password.
