# Three-view evidence UI (RB-010)

Status: **draft mock** — visibly labeled mock data until RB-005 contracts freeze and RB-008/RB-009 supply real streams.

Stack: React + Vite + CSS Modules (`apps/web`), per AGENTS.md §6–7 / §15.

## Views

| View | Purpose | Must never confuse |
| --- | --- | --- |
| Campaign setup | Target, rule pack, agent mode, budgets, spend confirmation, explicit start | Live vs scripted; spend enabled vs blocked |
| Activity timeline | Actor-labeled actions, balances, rules checked, stop | Actor identity; live / scripted / replay mode |
| Finding detail | Failed rule, responsible action, before/after, replay status, limitations | `candidate` / `confirmed` / `not_reproduced` / `inconclusive` |

Later (post RB-009): Replay comparison + Export panels.

## Visual rules

- Evidence and outcome outrank agent narrative (no chat-wall primary layout).
- Mode pills: `Live agents`, `Scripted fixture`, `Recorded replay`.
- Status pills: `candidate`, `confirmed`, `not_reproduced`, `inconclusive`.
- Persistent **MOCK DATA** banner while mock routing is active; remove before acceptance.
- Never show a green “secure” badge after a bounded negative run.
- Keyboard-operable controls, textual status (not color alone), visible errors.

## Integration gates

- Wire to schema-valid events after RB-005.
- Replace mocks with durable campaign stream after RB-008.
- Replay / fixed-vs-faulty comparison after RB-009.
- Lockfile / `npm ci` for web deps coordinated with Engineer Overlord (do not race RB-002 lockfile).
