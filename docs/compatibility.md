# Compatibility

**Document status:** RB-002 bootstrap record. Distinguishes planned pins from verified local evidence.

## Intended pins (charter)

| Component | Pin | Source |
| --- | --- | --- |
| Node | `>=26.5.0 <27.0.0` (`.node-version` → `26.5.0`) | AgenC SDK engines; AGENTS.md §4 |
| npm | `>=11.17.0` | Upstream documented npm 11.17.0 [S1] |
| Language | TypeScript strict, ESM | AGENTS.md §4 |
| Package manager | npm workspaces + committed `package-lock.json` | AGENTS.md §4 |
| AgenC launcher/runtime (planned) | `0.17.0` | Inspected source snapshot |
| AgenC embedding SDK (planned) | `@tetsuo-ai/agenc-sdk@0.3.0` | Inspected `packages/agenc-sdk` |
| Inspected upstream commit | `5c343c3c51ae0886411cce3f7954b9bf53c7c1ca` (`tetsuo-ai/agenc-core`) | AGENTS.md §4 |

## Verified on Marco's Mac (2026-09-15)

| Check | Result |
| --- | --- |
| Prior default Node | `v22.22.2` / npm `10.9.7` (nvm) — **incompatible** with SDK engines |
| Installed via nvm | `node v26.5.0` / `npm 11.17.0` |
| `npm install` (workspace bootstrap) | OK — lockfile committed; 55 packages audited |
| Installed toolchain (this host) | typescript 5.9.x, vitest 3.2.x, zod 4.x, @types/node 24.x (exact versions in package-lock.json) |
| `npm run preflight` | OK under Node 26.5.0 / npm 11.17.0 |
| `npm run preflight` on Node 22.22.2 | Failed as required (wrong Node + npm) |
| `npm run typecheck` | OK |
| `npm test` | OK — 1 pin smoke test |
| AgenC daemon handshake | **Not run** in RB-002 (belongs to RB-003) |
| Published npm integrity for `@tetsuo-ai/agenc-sdk` | **Pending** RB-003 / publish verification |

## Explicit non-claims

- RB-002 does **not** prove AgenC daemon, MCP, or provider integration.
- Live spend remains disabled (`RULEBREAK_LIVE_ENABLED=false`).
- Empty workspaces under `apps/` / `packages/` are intentional until their first implementation task lands.

## Reviewer

Backend Architect Wizard reviews pins, engines, and that preflight cannot be satisfied by inventing a passing report.
