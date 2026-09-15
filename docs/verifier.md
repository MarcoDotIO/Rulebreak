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

## Non-claims

- Not yet wired into a durable campaign pipeline (RB-008).
- Not a live AgenC isolation proof (G2–G4 still open).
