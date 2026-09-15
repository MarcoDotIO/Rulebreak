# Demo script (four minutes)

**Status:** Beats map to **Verified** offline gate + integration coverage (Archivist cold pass 2026-09-15 19:14 EDT).  
**Packaging:** `npm run demo:offline` runs `ci:offline` then prints pointers — Verified as a gate entry, not as a UI walkthrough.

## Goal

Show a developer: known trade failure → independent detection → offline replay → regression that fails on faulty / passes on fixed — all **scripted**, no model.

## Script

| Minute | Beat | Verified command / artifact | Mode label |
| --- | --- | --- | --- |
| 0:00–0:40 | Problem: unique-item / trade lifecycle can break without a unit-test-shaped signal | Pitch from `docs/product.md` | — |
| 0:40–1:30 | Prove offline packaging / toolchain | `npm run demo:offline` or `npm run ci:offline` (**Verified**) | Offline gate |
| 1:30–2:20 | Scripted failure → candidate finding | Covered in gate via `tests/integration/scripted-campaign.test.ts` | Scripted · `candidate` |
| 2:20–3:10 | Offline replay without a model | Covered via `tests/integration/replay-regression.test.ts` → `matched_violation` | Recorded replay outcome |
| 3:10–4:00 | Fixed control + export; legitimate trade works | Same suite → `blocked_as_expected` + export bundle | Fixed control |

## Commands to rehearse

```bash
nvm use
npm ci                  # fresh checkout
npm run ci:offline      # or: npm run demo:offline
```

Optional UI (local only; not part of the offline gate claim):

```bash
npm run dev:server      # control API :4100
npm run dev:web         # UI :5173 proxies /api
```

## Non-claims

- Finding remains `candidate` in the durable store until promotion write exists; show replay outcome separately.
- Do **not** demo live agents until G2–G4 isolation evidence is complete.
- `npm run replay` CLI is still a stub — use the integration suite / full `npm test`.
- Exported `regression.test.ts` requires the matching Rulebreak harness packages (`docs/replay.md`).
