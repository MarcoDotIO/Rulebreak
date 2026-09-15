# Rulebreak

Adversarial agents for testing game-economy rule violations.

**Status:** Early bootstrap. See `AGENTS.md` for the project charter. Do not treat planned commands as verified until listed below with evidence.

## Prerequisites

- Node `26.5.0` (see `.node-version`; range `>=26.5.0 <27.0.0`)
- npm `>=11.17.0`

On this host, with nvm:

```bash
nvm install 26.5.0
nvm use
```

## Offline bootstrap (RB-002)

```bash
npm ci
npm run preflight
npm run typecheck
npm test
```

Copy `.env.example` to `.env` for local overrides. Keep `RULEBREAK_LIVE_ENABLED=false` until spend is approved.

## Compatibility

Recorded pins and verification evidence: [`docs/compatibility.md`](docs/compatibility.md).
