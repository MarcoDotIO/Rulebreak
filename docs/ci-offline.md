# Offline CI gate (RB-012)

**Owner:** Engineer Overlord  
**Reviewer:** Backend Architect Wizard  
**Scope:** Local fresh-checkout gate — **not** GitHub Actions / CD (DevOps Forge Keeper).

## Command

```bash
nvm use                 # .node-version → 26.5.0
npm ci                  # fresh checkout
npm run ci:offline
```

Alias used for demo packaging:

```bash
npm run demo:offline    # runs ci:offline, then prints vertical-slice pointers
```

## What it runs

1. Offline env assert — refuses `RULEBREAK_LIVE_ENABLED=true` and ambient provider/operator secrets
2. `npm run preflight`
3. `npm run typecheck`
4. `npm test` (includes scripted-campaign + replay-regression)
5. `npm run typecheck -w @rulebreak/web`
6. `npm run build:web`

## Live opt-in (separate)

Live smoke is **not** part of this gate. Keep `RULEBREAK_LIVE_ENABLED=false` until G2–G4 isolation + spend approval. Incomplete live config already fails `preflight`.

## Acceptance

| Check | Evidence |
| --- | --- |
| Fresh checkout / clean tree runs offline without provider keys | `npm run ci:offline` exit 0 |
| Live mode refused by gate | Setting `RULEBREAK_LIVE_ENABLED=true` fails ci:offline |
| Ambient secrets refused | Non-empty `XAI_API_KEY` / `RULEBREAK_OPERATOR_TOKEN` / etc. fails ci:offline |
| Demo packaging entry | `npm run demo:offline` runs the same gate |

## Non-claims

- Does not install or run GitHub Actions workflows
- Does not enable live AgenC explorers
- Does not promote findings `candidate` → `confirmed`

## Archivist cold verification

Independent cold follow of this guide 2026-09-15 19:14 EDT (Mnemosyne Archivist) at tip `6897779`: `npm run ci:offline` and `npm run demo:offline` both **OK** on Node 26.5.0 / npm 11.17.0 (macOS arm64). See `docs/reproduction.md`.
