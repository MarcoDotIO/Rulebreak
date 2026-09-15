# Demo script (four minutes)

**Status:** Incomplete — RB-014. Do not present this as a rehearsed demo until the checklist below is green.

## Goal

Show a developer: known trade failure → independent detection → offline replay → regression that fails on faulty / passes on fixed.

## Script (draft placeholders)

| Minute | Beat | Verified command / artifact | Owner to supply |
| --- | --- | --- | --- |
| 0:00–0:40 | Problem: economic rule can break without a unit-test-shaped signal | — | Product |
| 0:40–1:30 | Run **scripted** failure on vulnerable target | `npm run demo:offline` (**not verified**) | Engineer Overlord |
| 1:30–2:20 | Show finding: rule, actors, evidence | UI finding detail / export bundle | UI Design Goblin |
| 2:20–3:10 | Offline replay without a model | `npm run replay` (**not verified**) | Engineer Overlord |
| 3:10–4:00 | Safety test red on faulty, green on fixed; legitimate trade still works | exported `regression.test.ts` | Engineer Overlord |

## Incomplete

- [ ] Replace every “not verified” row with a command that was actually run
- [ ] Attach sample `finding.json` / `trace.json` paths once RB-009 exports exist
- [ ] Rehearse once with a non-author narrator
