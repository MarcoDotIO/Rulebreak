# RB-020: a verifier throw ends a campaign as failed / error, and one terminal status field contract

Status: built by Engineer Overlord. Product: Titan. Replay boundary: Backend Architect Wizard. Sequencing: Scrum Master Chronomancer. UI consumer: UI Design Goblin (`apps/web` is not changed here). Offline, $0.

## 1. What changes when the verifier throws

Before RB-020, a throw from `verifyTransition` in the scripted runner left the campaign `running`, with an `action_submitted` event that was never closed, and the control API answered HTTP 500 without registering the session (so `GET /api/campaigns/:id` was 404). The benchmark runner already recorded such a run as `error` (RB-015) and the RB-017 reducer already counts it as a rejected candidate; neither changes.

- **Scripted runner** (`ScriptedCampaignRunner.submit`, so also `run()`, `retryDispatch` and `runKnownFaultyScript`): when `verifyTransition` throws, the runner
  1. does not commit the action (it has no verified state hashes); actions committed before it stay recorded;
  2. appends a `system_error` event `{ code: "verifier_error", message, logicalActionId }`, which closes out that action's `action_submitted`;
  3. marks the campaign `failed` with stored outcome `error`, appends `campaign_state { status: "failed" }`, and admits no further actions;
  4. rethrows, so callers still see the throw (RB-019 pins that `run()` propagates it; the benchmark runner still records `error`).
- **Control API, `POST /api/campaigns`:**
  - a verifier throw during the run: the runner has already recorded `failed` / `error` (`verifier_error`); the server catches the throw, registers the session and answers 200 with `status: "failed"`, `outcome: "error"`;
  - any other throw during the run (for example the target executor or the evidence store): the server appends `system_error { code: "run_error", message, logicalActionId }` (`logicalActionId` when the last event is an unclosed `action_submitted`) and `campaign_state { status: "failed" }`, marks the campaign `failed` / `error`, registers the session and answers 200;
  - a throw during the confirming replay, the control replay or the export: the server appends `system_error { code: "replay_error", message }` and `campaign_state { status: "failed" }`, marks the campaign `failed` / `error`, registers the session and answers 200. The finding keeps whatever status it had reached, and the campaign error never downgrades it: it is normally `candidate`, but it is `confirmed` if the confirming replay promoted it and then the control replay or the export threw.
- `system_error.message` names the error class and the action only; raw exception text is not written into the event log.
- For the throws handled here (`verifier_error` in the scripted runner and the control API, `run_error` and `replay_error` in the control API; tests in §4), the campaign never ends as `completed`, `no_violation_observed` or `running`. Out of scope: a non-verifier throw in the scripted runner used on its own (outside the control API) propagates to its caller and leaves the campaign row as it was; a throw while constructing the runner still answers HTTP 500 with no session.

## 2. Terminal status field contract (for the UI)

All three places read one source, the stored campaign row (`terminalOf` in `apps/server/src/index.ts`), so they return the same values.

**Closing SSE event.** `GET /api/campaigns/:id/events` sends one `campaign` event per stored event and then closes with the existing `done` event, now carrying two more fields:

```
event: done
data: {"ok":true,"campaignId":"<id>","status":"<status>","outcome":"<outcome>"}
```

`ok: true` only means the stream finished sending. It does not mean a clean result; read `status` and `outcome`.

**Refetch.** `GET /api/campaigns/:id` returns top-level `status` and `outcome` with the same values as the `done` event, and `campaign.status` equals `status`. `POST /api/campaigns` returns the same two top-level fields.

| `status` | `outcome` | When |
| --- | --- | --- |
| `completed` | `no_violation_observed` | the run finished and the verifier reported no violation |
| `completed` | `violation_candidate` | a violation was recorded and the confirming replay did not confirm it (see `finding.status`) |
| `completed` | `violation_confirmed` | a violation was recorded and the confirming replay confirmed it |
| `stopped` | `stopped` | an operator stop arrived while the campaign was running |
| `failed` | `error` | the verifier threw during the run (`verifier_error`), something else threw during the run (`run_error`), or the confirming replay, control replay or export threw afterwards (`replay_error`) |

- `status` is the existing `CampaignStatus` enum (`pending`, `running`, `stopped`, `completed`, `failed`). `pending` and `running` never appear for a finished campaign; `outcome` is `null` only while a campaign has no recorded outcome.
- On `failed` / `error` the event stream also contains a `system_error` event (`code` is `verifier_error`, `run_error` or `replay_error`) followed by a `campaign_state` event with `status: "failed"`.
- `finding` (possibly `null`) carries the finding status separately: `candidate`, `confirmed`, `not_reproduced` or `inconclusive`. A `confirmed` finding can sit on a `failed` / `error` campaign (the confirming replay promoted it, then the control replay or the export threw); the campaign error never downgrades the finding.
- `system_error.payload.logicalActionId` is a new optional field on the existing event schema.

## 3. A malformed target snapshot is a boundary input error

A structurally invalid snapshot (for example a negative balance, which `WorldStateSchema` rejects) is a boundary input (contract) error, not an invariant result. `evaluateTransitionInvariants` parses both snapshots at `packages/verifier/src/predicates.ts:297-298` and throws. With RB-020, that throw ends the campaign `failed` / `error` as above; it is never reported as INV-001 and never as a clean result. INV-001 is reported on well-formed state through `evaluateStateInvariants`, which turns a schema parse failure into INV-001 (RB-007, `efa178c`). `docs/verifier.md` carries the same note.

## 4. Tests

- `tests/integration/rb-020-terminal-status.test.ts` (5 tests). The verifier is wrapped so `verifyTransition` throws on demand; every other export is real.
  - scripted runner (`ScriptedCampaignRunner.run` and `runKnownFaultyScript`): `failed` / `error`, the action before the throw is kept, no `action_submitted` is left without its `action_completed` or `system_error`, nothing more is admitted;
  - control API, throw during the run: POST, GET and the `done` event all say `failed` / `error`, and GET is 200;
  - control API, throw during the replay: the same, with the finding still `candidate` and a `replay_error` event;
  - control API, a non-verifier throw during the run (the evidence store fails on the second action): POST, GET and `done` all say `failed` / `error`, with a `run_error` event that closes out the action;
  - control API without a throw: the same fields carry `completed` / `violation_confirmed` (faulty) and `completed` / `no_violation_observed` (fixed).
- `tests/verifier/rb-019-import-boundary.test.ts` gains one self-check (RB-019 review item N4): the scanner rejects a relative import that leaves the package and allows one that stays inside it.

## 5. Unchanged

The RB-015, RB-016, RB-017 and RB-018 bench outputs, snapshots and store rows are identical to main apart from wall time, the commit stamp and timestamps (the verifier never throws in those runs). The RB-019 tests pass unchanged apart from the added N4 self-check.

Caps: offline only; synthetic fixtures; paid spend $0; the LLM arms are `not_run`; Thor-over-SSH runs are not `llm_dual` results; G4 is Not run; M13 is Partial; the pitch is not closed; this is not evidence of general exploit-detection performance and makes no security claim.
