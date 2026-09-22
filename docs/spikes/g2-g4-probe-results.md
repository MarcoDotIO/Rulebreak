# G2–G4 offline probe results

Generated: 2026-09-22T18:12:14.306Z (local host)

**Mode:** offline only — no paid provider calls

| Pass | Fail | Not run | Total |
| --- | --- | --- | --- |
| 13 | 0 | 2 | 15 |

| ID | Status | Detail |
| --- | --- | --- |
| G2-P1 | **Pass** | homes /Users/marcodotio/Developer/Grok-Bot-2026/rulebreak/.rulebreak/agenc-home-player-a / /Users/marcodotio/Developer/Grok-Bot-2026/rulebreak/.rulebreak/agenc-home-player-b; servers={"aKeys":["rulebreak-player-a"],"bKeys":["rulebreak-player-b"]} |
| G2-P2 | **Pass** | stub mcp.json per home with actor-only env (agenc mcp list not required for stub) |
| G2-P3 | **Pass** | spawnAgent+attach ×2 (Ollama llama3.2); sessions=player-a:session_fad8a514-2968-4f93-8f1d-453916ecd27d, player-b:session_91c32293-4279-435e-b767-0f893545b7d1; artifact=docs/spikes/g2-p3-session-artifact.json |
| G2-P4 | **Pass** | home A mcp.json does not reference player-b (and reverse) |
| G3-P1 | **Pass** | distinct observe=true; toolsA=economy_observe,trade_create,trade_accept,trade_cancel,strategy_note |
| G3-P2 | **Pass** | CoordinatorBridge bound explorer path tests green |
| G3-P3 | **Pass** | Ollama offline-model; model=gemma4; bound economy_observe player-a JSON (currency/inventory). alwaysLoad=eager-load workaround; bypassPermissions=spike race fix — neither is G4. artifact=docs/spikes/g3-p3-ollama-artifact.json (supporting only) |
| G3-P4 | **Pass** | player-a observe payload is self-scoped in MCP bridge stub state |
| G4-P1 | **Pass** | Bash/unknown tool rejected at MCP allowlist |
| G4-P2 | **Pass** | actorId/filePath/fixtureMode rejected at bridge |
| G4-P3 | **Not run** | bypassPermissions spike leaves callbackLog empty — permission-callback path still deferred (not a G4 claim) |
| G4-P6 | **Pass** | fixtureMode rejected on economy_observe |
| G4-P5 | **Pass** | requireOperator on POST /api/campaigns and stop; 401/503 paths present |
| G4-P4 | **Not run** | no worker jail/mount boundary in-repo yet — see OS inventory; do not claim FS denial |
| G4-P7 | **Pass** | OS inventory sheet present with recorded environment |

Machine JSON: `.rulebreak/spikes/g2-g4-offline-probe-results.json` (gitignored under `.rulebreak/`).

Live discovery remains **out of pitch** until full G2–G4 (or Marco accepts a written reduced claim).

## G4-P3 honesty (non-G4 labels)

G3-P3 true Pass (#37 @ `75a53c9`) does **not** close G4-P3 or live gates.

| Label | Honest meaning | Not a claim of |
| --- | --- | --- |
| `alwaysLoad` | Eager-load / deferred-MCP workaround so `economy_observe` is discoverable offline | G4 containment |
| `bypassPermissions` / unattended allow-deny | Spike race harness so G3-P3 can finish without approve/deny stalls | G4 permission-callback proof |

- Offline rollup remains **13 Pass / 0 Fail / 2 Not run** with **G4-P3 = Not run** (and G4-P4 Not run).
- G3-P3 artifact `callbackLog` is empty under `bypassPermissions` — grader must **refuse Pass** for G4-P3 from that state.
- Supporting G3-P3 Pass does **not** close live G2–G4 / RB-011 (stays **Blocked**).
- Detail: `docs/spikes/g4-p3-honesty.md`; grader guard: `scripts/spikes/g4-p3-grade.mjs` (wired from `g2-g4-offline-probes.mjs`).

## Archivist verification

Independent re-run 2026-09-15 19:55 EDT (Mnemosyne Archivist) at tip `de6da8f`: `npm run spike:g2-p3` → **Pass** (criteria: two session IDs, each env → own home, distinct daemon sockets). Ollama `llama3.2`, no prompt turn / no paid spend.

**Shared-cwd caveat:** `scripts/spikes/g2-p3-agenc-sessions.mjs` passes the same repo root as `cwd` to both actors. Do **not** read G2-P3 Pass as filesystem isolation. Live discovery / RB-011 remains out of pitch until remaining probes + Marco’s live criteria are met.
