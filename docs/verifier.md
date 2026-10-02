# Independent verifier (RB-007)

**Owner:** Engineer Overlord  
**Reviewer:** UI Design Goblin (independent challenge)  
**Package:** `@rulebreak/verifier`

## Guarantees

- Predicates implement INV-001–INV-005 from the approved rule pack.
- The verifier **does not import** `@rulebreak/economy` mutation handlers.
- Hand-built valid/corrupted snapshots live in `tests/verifier/invariants.test.ts`.
- Optional detector smoke in `tests/verifier/faulty-fixture-detection.test.ts` uses economy fixtures only to show the known fault is caught; it is not the correctness oracle.

## API

- `verifyTransition({ preState, envelope, result, postState, rulePack? })`
- `evaluateStateInvariants(state)`
- `hashWorldState(state)` — domain-only SHA-256 prefix

## Malformed snapshots (boundary input errors)

- A structurally invalid snapshot (one that `WorldStateSchema` rejects, such as a negative balance) is a boundary input (contract) error, not an invariant result.
- On the transition path, `evaluateTransitionInvariants` parses both snapshots (`src/predicates.ts:297-298`) and throws; `verifyTransition` passes the throw on. Callers record it as an error: the benchmark runner as `error` (RB-015), the RB-017 reducer as a rejected candidate, and the scripted runner and control API as campaign `failed` / `error` (RB-020, `docs/contracts/rb-020-terminal-status.md`).
- On the state path, `evaluateStateInvariants` reports a schema parse failure as INV-001 (RB-007).

## Non-claims

- Not yet wired into a durable campaign pipeline (RB-008).
- Not a live AgenC isolation proof (G2–G4 still open).
