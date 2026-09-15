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
| 1:30–2:20 | Scripted failure → **candidate** finding | `tests/integration/scripted-campaign.test.ts` | Scripted · `candidate` |
| 2:20–3:00 | Same-target replay → durable **confirmed** | `tests/integration/confirm-promotion.test.ts` (**Verified** 3/3) | Store-backed `confirmed` |
| 3:00–3:30 | Fixed control does **not** promote / not “secure” | Same suite: stays `candidate` on fixed-only | `blocked_as_expected` |
| 3:30–4:00 | Safety export + legitimate trade | `tests/integration/replay-regression.test.ts` | Faulty red / fixed green |

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

- Say **confirmed** only when the store wrote it after same-target `matched_violation` — never from UI chrome alone.
- Fixed-control `blocked_as_expected` is not “secure” and does not promote.
- Do **not** demo live agents until G2–G4 isolation evidence is complete.
- `npm run replay` CLI is still a stub — use the integration suite / full `npm test`.
- Exported `regression.test.ts` requires the matching Rulebreak harness packages (`docs/replay.md`).
