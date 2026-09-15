# `@rulebreak/web`

Evidence-first SPA for Rulebreak (campaign setup, activity timeline, finding detail).

## Current state

Clickable three-view shell with **visible MOCK DATA** banner and placeholder events.
Dependencies are declared but **not yet installed** into the root lockfile — coordinate `npm install` with Engineer Overlord after RB-002 review/merge.

## Intended commands (after lockfile update)

```bash
npm run dev:web
npm run build:web
```

Default offline/scripted presentation only. Live agents stay disabled in the mock start path.
