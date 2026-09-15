# Three-view evidence UI (RB-010)

Status: **live scripted stream** — views read from the local Fastify control API (`apps/server`) backed by RB-008/RB-009. Mock fixtures remain for contract tests only.

## Views

1. **Campaign setup** — lists approved targets/rule packs from `GET /api/targets`, starts `POST /api/campaigns` (scripted known-failure path).
2. **Activity timeline** — consumes `GET /api/campaigns/:id/events` (SSE) plus usage from campaign detail.
3. **Finding detail** — loads `GET /api/findings/:id` including before/after snapshot summary and fixed-target control replay.

## Banner

- Offline: control API unreachable.
- Live: scripted stream / campaign complete — never labeled as mock when API is up.

## Local run

```bash
npm run dev:server   # :4100
npm run dev:web      # :5173, proxies /api → :4100
```

## Still out of scope

- Live AgenC explorers
- Operator token UX
- Non-synthetic targets
