# `@rulebreak/web`

Evidence-first SPA for Rulebreak (campaign setup, activity timeline, finding detail).

## Current state

Clickable three-view shell with a persistent **MOCK DATA** banner and **schema-valid**
fixtures from `@rulebreak/contracts` (RB-005). Campaign stream / live replay land with
RB-008 / RB-009 — this package does **not** claim live integration.

Contract enums used by the mocks:

- Provenance: `live` | `scripted` | `recorded`
- Finding status: `candidate` | `confirmed` | `not_reproduced` | `inconclusive`
- Replay outcomes: `matched_violation` | `diverged` | `blocked_as_expected` | `error`

## Commands

From repo root (Node 26.5+ / npm 11.17+):

```bash
npm ci
npm run preflight
npm run typecheck
npm test
npm run build:web
npm run dev:web
```

Default path is offline/scripted. Thor dual-agent live provenance can be enabled when `/api/health.thorDualAgent.canEnableLiveAgents` (live gate + credentials, or #48 Pass evidence). Not AgenC dual sessions; SSH≠G4; pitch not closed; browser does not SSH.
