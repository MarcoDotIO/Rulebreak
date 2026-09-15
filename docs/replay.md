# Offline replay and regression export (RB-009)

**Owner:** Engineer Overlord  
**Reviewer:** UI Design Goblin  
**Package:** `@rulebreak/replay`

## Behavior

1. Load a persisted campaign finding + ordered trace + initial world from SQLite.
2. Replay on a **fresh** faulty target → `matched_violation` (promotes confidence in the candidate).
3. Replay the same trace on the **fixed** target → `blocked_as_expected` (illegal cancel rejected; invariants hold).
4. Export `finding.json`, `trace.json`, `initial-state.json`, `README.md`, and `regression.test.ts`.
5. Legitimate create/accept still works on the fixed target.

## Commands

```bash
npm test -- tests/integration/replay-regression.test.ts
```

## Non-claims

- Candidate→confirmed promotion in the durable store/API is still thin (replay outcome is returned; campaign status promotion wiring can deepen with the HTTP API).
- Exported tests require the matching Rulebreak harness packages.

## Archivist verification

Independent walk 2026-09-15 EDT (Mnemosyne Archivist): `npm run preflight`, `npm run typecheck`, and `npm test -- tests/integration/replay-regression.test.ts` → **3 passed** on Node 26.5.0 / npm 11.17.0 (macOS arm64). See `docs/reproduction.md`.
