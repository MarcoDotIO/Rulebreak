# G2–G4 isolation probe plan (offline)

**Status:** Draft plan only — **do not run live / do not spend**  
**Owner:** Backend Architect Wizard  
**Pairing:** Engineer Overlord (runtime), Backend Architect Wizard (boundary review)  
**Date:** 2026-09-15  
**Charter refs:** `docs/security/live-acceptance-gate.md`, `docs/threat-model.md`, `docs/spikes/rb-003-notes.md`, AGENTS.md §10 / §13

## Purpose

Define the **exact evidence** required to close live-acceptance gates **G2–G4** without inventing a passing report. This document is the offline plan Chronomancer assigned. Execution of paid/live model turns stays blocked until Marco approves spend and these probes pass.

## Current baseline (already recorded)

| Item | Status | Where |
| --- | --- | --- |
| G1 toolchain | Signed off | RB-002 / `ci:offline` |
| Separate `AGENC_HOME` per actor | Spike recorded | `docs/spikes/rb-003-notes.md` |
| Direct MCP observe + spoof/Bash reject | Automated | `npm run spike:rb003` |
| Authority fields incl. `filePath` / `fixtureMode` | Bridge + contracts | RB-004/005/PR #9 |
| Model→MCP live turn | **Not proven** | spike notes |
| OS containment (no source mount / Docker / egress) | **Not proven** | threat model non-claims |
| Live Grok/xAI | **Not attempted** | needs BYOK / spend approval |

## Non-negotiables for this plan

1. **No paid provider calls** during probe design or dry runs unless Marco explicitly approves a spend window.
2. Prefer **Ollama / offline** for any model-adjacent dry run; label results `offline-model` vs `live-provider`.
3. Prefer **direct MCP / permission-callback / filesystem probes** over “the model said it couldn’t.”
4. Prompt wording alone is **not** G4 evidence.
5. Solana (if ever touched) stays on **devnet** only — out of scope for G2–G4 today.
6. Work **local-only** on Marco’s Mac host (no cloud agents).

---

## G2 — Two bound explorer contexts

### Claim to prove

Two separately created agent/session contexts exist, each bound to exactly one player actor (`player-a` / `player-b`), with distinct trusted bindings (separate `AGENC_HOME` and actor-scoped MCP registration).

### Offline probes (ordered)

| ID | Probe | Pass criteria | Artifact to keep |
| --- | --- | --- | --- |
| G2-P1 | Create two absolute homes: `.rulebreak/agenc-home-player-a` and `...-player-b` | Paths exist; neither home contains the other’s MCP config entry | `ls` + config dump (redact secrets) |
| G2-P2 | Register MCP once per home with `RULEBREAK_ACTOR_ID` set only in that process env | `agenc mcp list` (or equivalent) shows one Rulebreak server per home | Command transcript |
| G2-P3 | `createSession` (or documented 0.17 equivalent) twice — once per home | Two session IDs; each session’s env/plugin root points at its own home | Spike log with real API names from installed SDK |
| G2-P4 | Cross-read check: from home A, attempt to invoke home B’s MCP socket/config | Fails closed or is unreachable | Negative transcript |

### Explicit fail modes

- Shared `AGENC_HOME` for both actors
- Both actor bearer/env values visible in one model-writable workspace
- Single MCP server that picks actor from tool args

---

## G3 — Domain tool round-trip under binding

### Claim to prove

A **bound** context can complete a real domain tool round-trip (`economy_observe` at minimum; preferably one mutating tool against the fixed synthetic target), and the coordinator sees a structured result attributed to that actor only.

### Offline probes

| ID | Probe | Pass criteria | Artifact |
| --- | --- | --- | --- |
| G3-P1 | Direct MCP (no model): `economy_observe` as player-a vs player-b | Distinct inventories; campaignId from env binding | `spike:rb003` JSON (already green — **re-run at tip**) |
| G3-P2 | Same binding through worker/coordinator path (scripted driver calling bridge) | Result envelope carries trusted actor; no explorer-supplied actorId | Unit/integration test or spike script output |
| G3-P3 | Optional offline-model turn (Ollama only): session prompted to call `economy_observe` | Tool invocation appears in session/tool trace; result matches binding | Trace labeled `offline-model` — **does not** close G3 alone if flaky |
| G3-P4 | Negative: bound player-a cannot observe player-b private inventory beyond public rules | Only public trade data + self view | Observation payload review |

### What does **not** count

- Stub JSON returned without going through the registered MCP transport
- Coordinator forging an observe result without a tool call
- A single successful Ollama turn without a durable automated regression

### Minimum for G3 sign-off

**G3-P1 + G3-P2** required. G3-P3 is supporting evidence only until stable.

---

## G4 — Denied-operation checks

### Claim to prove

Unapproved capabilities are **effectively denied** for explorer contexts: shell, arbitrary FS, daemon control, operator HTTP, target reset/dispose, verifier snapshot, fixture selection.

### Offline probes (effective denial, not prompt text)

| ID | Probe | Pass criteria | Artifact |
| --- | --- | --- | --- |
| G4-P1 | MCP allowlist: call `Bash` / unknown tool | `isError` / unknown tool (already in `spike:rb003`) | Spike JSON |
| G4-P2 | Authority spoof: `actorId`, `campaignId`, `filePath`, `fixtureMode` | Rejected at bridge (already covered — **keep green**) | Spike + contract tests |
| G4-P3 | Permission-callback path: request a forbidden tool class the SDK surfaces | Deny recorded; no execution side effect | Callback log |
| G4-P4 | Filesystem: from explorer session, attempt read of repo source / `.env` / evidence DB path | Denied or path not mounted into worker | Negative transcript + mount inventory |
| G4-P5 | Operator surface: player-scoped credentials cannot `POST /api/campaigns` or stop campaigns | 401/403 or network-unreachable from worker context | Negative HTTP probe |
| G4-P6 | Fixture/mode: explorer cannot select `faulty` via tools | Rejected field / absent tool | Bridge + economy boundary tests |
| G4-P7 | OS inventory (documentation probe) | Record whether worker has source checkout, Docker socket, SSH agent, home mount, open egress | `docs/spikes/g2-g4-os-inventory.md` filled honestly |

### Sign-off rule

- **G4 partial (demo-local):** G4-P1, P2, P6 green + G4-P7 documented limitations → may keep **loopback scripted** demo; still **no live pitch**.
- **G4 full (live gate):** also G4-P3–P5 green with effective denial, and G4-P7 shows no forbidden mounts / unrestricted egress — or an explicit reduced isolation claim Marco accepts.

---

## Suggested execution order (still no spend)

0. Run offline probe harness: `npm run spike:g2g4` (writes `docs/spikes/g2-g4-probe-results.md`).
1. Re-run `npm run spike:rb003` + `npm run ci:offline` at current `main` (regression of G3-P1 / G4-P1–P2).
2. Add automated tests for any gap between spike script and worker/coordinator path (G3-P2).
3. Fill OS inventory sheet (G4-P7) without changing runtime — **honesty first**.
4. Implement missing negative probes G4-P3–P5 as local scripts under `scripts/spikes/` and `tests/security/` todos currently open.
5. Only after Marco approves: optional Ollama G3-P3; separately, optional live provider smoke **outside** this plan.

## Reviewers

| Gate | Author | Reviewer |
| --- | --- | --- |
| Probe scripts / worker wiring | Engineer Overlord | Backend Architect Wizard |
| Policy matrix / threat alignment | Backend Architect Wizard | Engineer Overlord |
| UI must not imply live isolation | — | UI Design Goblin (when evidence lands) |

## Done means

A short spike note update lists each G2–G4 probe ID with **Pass / Fail / Not run**, commands actually executed, and **no** live-discovery language in README/demo until Pass on the full live gate set (or Marco accepts a written reduced claim).
