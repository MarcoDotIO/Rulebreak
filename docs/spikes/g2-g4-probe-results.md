# G2–G4 offline probe results

Generated: 2026-09-22T17:49:05.062Z (local host)

**Mode:** offline only — no paid provider calls

| Pass | Fail | Not run | Total |
| --- | --- | --- | --- |
| 12 | 1 | 2 | 15 |

| ID | Status | Detail |
| --- | --- | --- |
| G2-P1 | **Pass** | homes /Users/marcodotio/Developer/Grok-Bot-2026/rulebreak/.rulebreak/agenc-home-player-a / /Users/marcodotio/Developer/Grok-Bot-2026/rulebreak/.rulebreak/agenc-home-player-b; servers={"aKeys":["rulebreak-player-a"],"bKeys":["rulebreak-player-b"]} |
| G2-P2 | **Pass** | stub mcp.json per home with actor-only env (agenc mcp list not required for stub) |
| G2-P3 | **Pass** | spawnAgent+attach ×2 (Ollama llama3.2); sessions=player-a:session_c27a0253-4eb8-4042-b1da-9f380c5959cc, player-b:session_4ab33c92-0f42-4faf-b5e7-f27baec4630c; artifact=docs/spikes/g2-p3-session-artifact.json |
| G2-P4 | **Pass** | home A mcp.json does not reference player-b (and reverse) |
| G3-P1 | **Pass** | distinct observe=true; toolsA=economy_observe,trade_create,trade_accept,trade_cancel,strategy_note |
| G3-P2 | **Pass** | CoordinatorBridge bound explorer path tests green |
| G3-P3 | **Fail** | soft/failed observe (tool call without successful bound result); status=Partial; artifact present — not a Pass |
| G3-P4 | **Pass** | player-a observe payload is self-scoped in MCP bridge stub state |
| G4-P1 | **Pass** | Bash/unknown tool rejected at MCP allowlist |
| G4-P2 | **Pass** | actorId/filePath/fixtureMode rejected at bridge |
| G4-P3 | **Not run** | permission-callback path needs AgenC session — deferred |
| G4-P6 | **Pass** | fixtureMode rejected on economy_observe |
| G4-P5 | **Pass** | requireOperator on POST /api/campaigns and stop; 401/503 paths present |
| G4-P4 | **Not run** | no worker jail/mount boundary in-repo yet — see OS inventory; do not claim FS denial |
| G4-P7 | **Pass** | OS inventory sheet present with recorded environment |

Machine JSON: `.rulebreak/spikes/g2-g4-offline-probe-results.json` (gitignored under `.rulebreak/`).

Live discovery remains **out of pitch** until full G2–G4 (or Marco accepts a written reduced claim).

## Archivist verification

Independent re-run 2026-09-15 19:55 EDT (Mnemosyne Archivist) at tip `de6da8f`: `npm run spike:g2-p3` → **Pass** (criteria: two session IDs, each env → own home, distinct daemon sockets). Ollama `llama3.2`, no prompt turn / no paid spend.

**Shared-cwd caveat:** `scripts/spikes/g2-p3-agenc-sessions.mjs` passes the same repo root as `cwd` to both actors. Do **not** read G2-P3 Pass as filesystem isolation. Live discovery / RB-011 remains out of pitch until remaining probes + Marco’s live criteria are met.
