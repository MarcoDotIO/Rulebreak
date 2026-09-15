# Reproduction guide

**Status:** Archivist-verified for the offline scripted + replay path on 2026-09-15 EDT.  
Second cold pass by a non-author is still open.

## Host evidence (this walk)

| Field | Value |
| --- | --- |
| Date | 2026-09-15 18:04 EDT |
| Host | macOS 27.0 · arm64 |
| Node / npm | `26.5.0` / `11.17.0` |
| Repo tip | `main` at walk time (post RB-009 / stream wiring) |
| Runner | Mnemosyne Archivist (independent of Engineer Overlord authorship) |

## A. Fresh toolchain

One-shot offline gate (RB-012):

```bash
nvm use
npm ci
npm run ci:offline      # preflight + typecheck + tests + web build; refuses live/ambient secrets
```

Or step-by-step:

```bash
nvm use                 # expects .node-version → 26.5.0
npm ci                  # if node_modules missing
npm run preflight       # Verified OK — offline
npm run typecheck       # Verified OK
```

Gate docs: [`docs/ci-offline.md`](ci-offline.md).

## B. Scripted known-failure campaign (RB-008)

```bash
npm test -- tests/integration/scripted-campaign.test.ts
```

**Verified result:** 5 passed — faulty path yields `violation_candidate` with `status: candidate` + `mode: scripted`; fixed path stores no finding; dispatch dedupe/stop covered.

## C. Offline replay + safety export (RB-009)

```bash
npm test -- tests/integration/replay-regression.test.ts
```

**Verified result:** 3 passed —

1. Fresh faulty replay → `matched_violation`
2. Fixed-target replay → `blocked_as_expected`; `legitimateTradeWorks()` true
3. Export writes `finding.json`, `trace.json`, `initial-state.json`, bundle `README.md`, and `regression.test.ts`

Package notes: [`docs/replay.md`](replay.md).

## D. What is still stubbed

| Operator script | Reality |
| --- | --- |
| `npm run demo:offline` | Prints pointer to section B; exit 0 — **not** a full demo CLI |
| `npm run replay` | `not-implemented` stub — use section C |
| `npm run demo:live` | Not for P0 pitch — live G2–G4 open |

## E. Independent checklist

- [x] Archivist followed A–C and recorded pass evidence (this file)
- [ ] Non-author follows A–C cold and files failures to owners
- [ ] Document durable `candidate`→`confirmed` once the store write lands
- [ ] Replace stub CLIs with real operator entrypoints

## Open questions

- Whether operator-facing replay should require lockfile hash as well as harness pin (today: test harness packages on matching checkout)
