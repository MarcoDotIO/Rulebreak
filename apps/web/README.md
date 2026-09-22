# `@rulebreak/web`

Evidence-first SPA for Rulebreak (campaign setup, activity timeline, finding detail).

## Current state

Clickable three-view shell wired to the **local campaign API** (`npm run dev:server`).
A persistent stream banner reports control-API reachability and scripted-stream status
(see `StreamBanner`) — this is **not** a mock-fixture banner. Schema-valid fixtures under
`src/mocks/` remain for unit tests and offline fallbacks only.

Provenance and finding labels stay honest to contracts (RB-005):

- Provenance: `live` | `scripted` | `recorded`
- Finding status: `candidate` | `confirmed` | `not_reproduced` | `inconclusive`
- Replay outcomes: `matched_violation` | `diverged` | `blocked_as_expected` | `error`

Visual direction on `main` is Candidate A (forensic ledger): copper spine, Fraunces +
Source Sans 3. `blocked_as_expected` uses a copper outline honesty chip — never a green
“secure” pill.

## Commands

From repo root (Node 26.5+ / npm 11.17+):

```bash
npm ci
npm run preflight
npm run typecheck
npm test
npm run build:web
npm run dev:server   # terminal 1 — campaign API
npm run dev:web      # terminal 2 — Vite on http://localhost:5173
```

Default path is offline/scripted against the bundled synthetic economy. Live agents stay
disabled in the setup start control until spend / isolation gates pass.
