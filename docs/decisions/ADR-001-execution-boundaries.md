# ADR-001: Execution boundaries for explorers and live mode

- **Status:** Accepted for V0 (RB-004)
- **Date:** 2026-09-15
- **Owners:** Backend Architect Wizard (policy), Engineer Overlord (runtime enforcement)

## Decision

1. Explorer authority comes only from a trusted campaign binding, never from model-supplied identity fields.
2. Explorers receive a fixed domain MCP allowlist; all other tool classes are denied and must be tested for effective denial.
3. Live mode defaults off and remains gated by `docs/security/live-acceptance-gate.md`.
4. Target mutation code and verifier predicates live in separate packages and must not share handlers.
5. The seeded faulty target is an explicitly marked fixture, defaulting off, never exposed through public explorer interfaces.

## Consequences

- RB-003 live sign-off requires gate G2–G7 evidence, not a green happy-path tool call alone.
- UI mocks (RB-010) must not invent management capabilities into explorer-facing surfaces.
- Future external game adapters must restate reset/snapshot/reproducibility guarantees; V0 claims apply only to the bundled synthetic target.
