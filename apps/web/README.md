# `@rulebreak/web`

Evidence-first SPA for Rulebreak (campaign setup, activity timeline, finding detail).

## Current state

Clickable three-view shell with a persistent **MOCK DATA** banner and placeholder events.
Contracts (RB-005) will replace mock shapes; campaign stream/replay land with RB-008/RB-009.

## Commands

From repo root (Node 26.5+ / npm 11.17+):

```bash
npm ci
npm run dev:web
npm run build:web
```

Default path is offline/scripted. Live agents stay disabled in the mock start control.
