# Three-view evidence UI (RB-010)

Status: **schema-valid mocks** — fixtures parse with frozen `@rulebreak/contracts`; no live campaign stream yet (RB-008/RB-009).

Stack: React + Vite + CSS Modules (`apps/web`), per AGENTS.md §15 / §18.5.

## Views

| View | Purpose | Must never confuse |
| --- | --- | --- |
| Campaign setup | Target, rule pack, agent mode, budgets, spend confirmation, explicit start | Live vs scripted; spend enabled vs blocked |
| Activity timeline | Actor-labeled actions, balances, rules checked, stop | Actor identity; live / scripted / replay mode |
| Finding detail | Failed rule, responsible action, before/after, replay status, limitations | `candidate` / `confirmed` / `not_reproduced` / `inconclusive` |

Later (post RB-009): Replay comparison + Export panels.

## Contract mapping (RB-005)

| UI concept | Contract schema / enum |
| --- | --- |
| Provenance pills | `ProvenanceModeSchema`: `live` \| `scripted` \| `recorded` (labels: Live agents / Scripted fixture / Recorded replay) |
| Campaign record | `CampaignSchema` (`campaignId`, `status`, `mode`, `targetId`, `rulePackId`, …) |
| Target card | `TargetManifestSchema` |
| Timeline rows | `CampaignEventSchema` discriminated union |
| Finding status | `FindingStatusSchema`: `candidate` \| `confirmed` \| `not_reproduced` \| `inconclusive` |
| Finding body | `FindingSchema` + nested `InvariantViolationSchema` |
| Replay pill | `ReplayResultSchema.outcome`: `matched_violation` \| `diverged` \| `blocked_as_expected` \| `error` |
| Usage strip | `UsageLedgerSchema` (display only until live budgets) |

Budget/spend confirmation fields on the setup view remain UI presentation helpers (not frozen campaign fields).

## Visual rules

- Evidence and outcome outrank agent narrative (no chat-wall primary layout).
- Mode pills: `Live agents`, `Scripted fixture`, `Recorded replay`.
- Status pills: `candidate`, `confirmed`, `not_reproduced`, `inconclusive`.
- Persistent **MOCK DATA** banner while mock routing is active; remove before acceptance.
- Never show a green “secure” badge after a bounded negative run.
- Keyboard-operable controls, textual status (not color alone), visible errors.

## Integration gates

- ✅ Wire mock fixtures to schema-valid `@rulebreak/contracts` (this slice).
- Replace mocks with durable campaign stream after RB-008.
- Replay / fixed-vs-faulty comparison after RB-009.
- Lockfile / `npm ci` for web deps coordinated with Engineer Overlord (do not race RB-002 lockfile).
