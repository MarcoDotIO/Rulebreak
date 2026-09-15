# Demo script (four minutes)

**Status:** Beats map to **Verified** integration commands (Archivist walk 2026-09-15 EDT).  
**Not a claim:** `npm run demo:offline` / `npm run replay` CLIs are still stubs or pointers.

## Goal

Show a developer: known trade failure → independent detection → offline replay → regression that fails on faulty / passes on fixed — all **scripted**, no model.

## Script

| Minute | Beat | Verified command / artifact | Mode label |
| --- | --- | --- | --- |
| 0:00–0:40 | Problem: unique-item / trade lifecycle can break without a unit-test-shaped signal | Pitch from `docs/product.md` | — |
| 0:40–1:30 | Run **scripted** failure on vulnerable target; candidate finding persists | `npm test -- tests/integration/scripted-campaign.test.ts` (**Verified** — 5/5) | Scripted fixture · `candidate` |
| 1:30–2:20 | Show finding: rule (`INV-003`/`INV-004`), actors, events — not narration | Persisted finding + events from campaign store; UI three-view when API up | Scripted · candidate (not confirmed) |
| 2:20–3:10 | Offline replay without a model on fresh faulty target | `npm test -- tests/integration/replay-regression.test.ts` (**Verified** — 3/3) → `matched_violation` | Recorded replay outcome |
| 3:10–4:00 | Fixed target blocks the same trace; legitimate trade still works; export present | Same suite → `blocked_as_expected` + export bundle files | Fixed control |

## Commands to rehearse

```bash
nvm use            # Node 26.5.x
npm ci             # if fresh checkout
npm run preflight
npm test -- tests/integration/scripted-campaign.test.ts
npm test -- tests/integration/replay-regression.test.ts
```

## Non-claims

- Do **not** say the finding is `confirmed` in the durable store until that promotion write exists (UI shows replay outcome separately).
- Do **not** demo live agents until G2–G4 isolation evidence is complete.
- Exported `regression.test.ts` requires the matching Rulebreak harness packages (`docs/replay.md`).
