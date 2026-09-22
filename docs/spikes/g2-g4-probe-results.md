# G2–G4 offline probe results

Generated: 2026-09-22T17:39:23.700Z (local host)

**Mode:** offline only — no paid provider calls

| Pass | Fail | Not run | Total |
| --- | --- | --- | --- |
| 13 | 0 | 2 | 15 |

| ID | Status | Detail |
| --- | --- | --- |
| G2-P1 | **Pass** | homes /Users/marcodotio/Developer/Grok-Bot-2026/rulebreak/.rulebreak/agenc-home-player-a / /Users/marcodotio/Developer/Grok-Bot-2026/rulebreak/.rulebreak/agenc-home-player-b; servers={"aKeys":["rulebreak-player-a"],"bKeys":["rulebreak-player-b"]} |
| G2-P2 | **Pass** | stub mcp.json per home with actor-only env (agenc mcp list not required for stub) |
| G2-P3 | **Pass** | spawnAgent+attach ×2 (Ollama llama3.2); sessions=player-a:session_8eabfa8c-0d89-4fed-bd37-d9d3ac4d362e, player-b:session_cf3ed3be-10bd-40c0-916d-55e2ca2e9329; artifact=docs/spikes/g2-p3-session-artifact.json |
| G2-P4 | **Pass** | home A mcp.json does not reference player-b (and reverse) |
| G3-P1 | **Pass** | distinct observe=true; toolsA=economy_observe,trade_create,trade_accept,trade_cancel,strategy_note |
| G3-P2 | **Pass** | CoordinatorBridge bound explorer path tests green |
| G3-P3 | **Pass** | Ollama offline-model; model=gemma4; economy_observe in tool trace; artifact=docs/spikes/g3-p3-ollama-artifact.json (supporting only — does not close G3 alone) |
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
