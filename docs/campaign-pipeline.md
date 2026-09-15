# Durable campaign pipeline (RB-008)

**Owner:** Engineer Overlord  
**Mode:** scripted (no model)  
**Packages:** `@rulebreak/campaign`, `@rulebreak/evidence`

## Behavior

1. Create a campaign labeled `mode: scripted`.
2. Admit trusted action envelopes in order against fixed or faulty fixtures.
3. Persist action + post-state + event in one SQLite transaction (`node:sqlite`).
4. Run `@rulebreak/verifier` after each action; freeze on first violation and store a `candidate` finding.
5. Identical `transportDispatchId` returns the persisted result; a different payload with the same id is rejected.
6. Stop revokes further admissions.

## Evidence commands

```bash
npm test -- tests/integration/scripted-campaign.test.ts
```

## Non-claims

- HTTP/SSE operator API not required for this task’s acceptance.
- Replay/export is RB-009.
- Live AgenC isolation still open.
