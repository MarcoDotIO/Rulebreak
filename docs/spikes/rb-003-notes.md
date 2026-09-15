# RB-003 — AgenC + scoped MCP spike notes

**Owner:** Engineer Overlord  
**Reviewer:** Backend Architect Wizard  
**Date:** 2026-09-15  
**Status:** Partial evidence recorded; live Grok spend not used

## Verified on Marco's Mac

| Check | Result |
| --- | --- |
| Published CLI | `@tetsuo-ai/agenc@0.17.0` installs; postinstall/runtime fetch works |
| Published embedding SDK on npm | **`@tetsuo-ai/agenc-sdk` is 404 on registry.npmjs.org** |
| Matching SDK | Built from git tag `agenc-v0.17.0` (`@tetsuo-ai/agenc-sdk@0.3.0`) |
| Daemon handshake | `connect()` negotiates protocol **1.2.0** against dedicated `AGENC_HOME` |
| Fresh mainline SDK vs 0.17 runtime | **Incompatible** — current `main` SDK requires plugin-storage authority newer than protocol 1.2.0 |
| `agent.create` without BYOK | Fails: managed keys need subscription |
| `agent.create` with Ollama | Works offline (`provider: "ollama"`, local models present) |
| Isolation approach | **Separate `AGENC_HOME` per actor** (fallback from AGENTS.md §10) — each home registers only that actor's MCP server |
| MCP bridge | `@rulebreak/mcp-tools` stdio server; actor from `RULEBREAK_ACTOR_ID` env |
| Direct MCP round-trip | `economy_observe` returns distinct inventories for player-a vs player-b |
| Authority spoof | `actorId` in tool args → `authority field rejected` |
| Shell tool registration | Not present on MCP allowlist |

## Not yet proven (still required for live G2–G4 sign-off)

- End-to-end model turn that actually invokes the MCP tool (Ollama prompt in progress / flaky)
- Effective OS denial of host shell/FS beyond permission-callback deny
- Usage ledger extraction across stop/cancel
- Grok/xAI path (needs Marco BYOK / spend approval) — **not attempted**

## Commands used (offline)

```bash
nvm use 26.5.0
npm install -D @tetsuo-ai/agenc@0.17.0
# SDK from tag agenc-v0.17.0 → vendor/agenc-sdk-0.3.0-v017
export AGENC_HOME="$PWD/.rulebreak/agenc-home-player-a"   # or -b
./node_modules/.bin/agenc daemon start
./node_modules/.bin/agenc mcp add rulebreak-player-a -t stdio -s user \
  -e RULEBREAK_ACTOR_ID=player-a -e RULEBREAK_CAMPAIGN_ID=spike-1 \
  -- "$(which node)" "$PWD/packages/mcp-tools/bin/rulebreak-mcp-player.mjs"
```

## ADR implication

Pin Rulebreak worker to **AgenC CLI 0.17.0 + SDK built from `agenc-v0.17.0`** until `@tetsuo-ai/agenc-sdk` is published or we cut a new ADR for a newer protocol pair. Do not import untagged `agenc-core` main into the worker.
