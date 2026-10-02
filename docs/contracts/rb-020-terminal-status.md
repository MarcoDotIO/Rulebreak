# RB-020 / RB-021: every throw ends a campaign as failed / error, and one terminal status field contract

Status: built by Engineer Overlord (RB-020, extended by RB-021: standalone runner throws, `start_error`, typed API error codes). Product: Titan. Replay boundary: Backend Architect Wizard. Sequencing: Scrum Master Chronomancer. UI consumer: UI Design Goblin (`apps/web` is not changed here). Offline, $0.

## 1. What changes when the verifier throws

Before RB-020, a throw from `verifyTransition` in the scripted runner left the campaign `running`, with an `action_submitted` event that was never closed, and the control API answered HTTP 500 without registering the session (so `GET /api/campaigns/:id` was 404). The benchmark runner already recorded such a run as `error` (RB-015) and the RB-017 reducer already counts it as a rejected candidate; neither changes.

- **Scripted runner** (`ScriptedCampaignRunner.submit`, so also `run()`, `retryDispatch` and `runKnownFaultyScript`): when `verifyTransition` throws, the runner
  1. does not commit the action (it has no verified state hashes); actions committed before it stay recorded;
  2. appends a `system_error` event `{ code: "verifier_error", message, logicalActionId }`, which closes out that action's `action_submitted`;
  3. marks the campaign `failed` with stored outcome `error`, appends `campaign_state { status: "failed" }`, and admits no further actions;
  4. rethrows, so callers still see the throw (RB-019 pins that `run()` propagates it; the benchmark runner still records `error`).
- **Scripted runner, any other throw (RB-021).** The runner itself now records every other throw, so this holds whether it is used on its own or under the control API:
  - a throw while executing or recording an action (the target executor, the envelope, the evidence store): `system_error { code: "run_error", message, logicalActionId }` closes out that action's `action_submitted`, the actions committed before it stay recorded, the campaign is marked `failed` / `error` with `campaign_state { status: "failed" }`, nothing more is admitted, and the throw is rethrown;
  - a throw in `run()` outside a single action: the same, with `run_error` and no `logicalActionId`;
  - a throw while constructing the runner after the campaign row was written (for example the initial `campaign_state` event fails to append): `system_error { code: "start_error" }`, and the row is marked `failed` / `error`, so nothing is left `pending` or `running`; the throw is rethrown. If the throw comes before the row exists (for example the campaign id fails `CampaignSchema`), there is no row to mark;
  - a throw after the run in a caller's confirming replay, control replay or export: the caller calls `runner.recordFailure("replay_error", message)`, which writes `system_error { code: "replay_error", message }` and marks the campaign `failed` / `error`. The finding keeps whatever status it had reached.
  - Only the first failure is written: once a campaign is `failed`, later calls are no-ops, so a verifier throw records `verifier_error` and nothing else. A malformed envelope is refused by the target and then makes the verifier's boundary parse throw, so it is recorded as `verifier_error`.
  - Every rethrow is kept, so the benchmark runner (which catches the throw and records `error`) and its outputs are unchanged.
- **Control API, `POST /api/campaigns`:**
  - a throw during the run (`verifier_error` or `run_error`): the runner has already recorded `failed` / `error`; the server catches the throw, registers the session and answers 200 with `status: "failed"`, `outcome: "error"`;
  - a throw during the confirming replay, the control replay or the export: the server calls `runner.recordFailure("replay_error", ...)`, registers the session and answers 200 with `failed` / `error`. The finding keeps whatever status it had reached, and the campaign error never downgrades it: it is normally `candidate`, but it is `confirmed` if the confirming replay promoted it and then the control replay or the export threw;
  - a throw while constructing the runner: HTTP 500 with the `start_error` body in §2a. No session is registered, so `GET /api/campaigns/:id` and the event stream answer 404 `campaign_not_found`. If the campaign row was written before the throw, it is marked `failed` / `error` (see above).
- `system_error.message` names the error class and the action only (for example `run threw (Error) on action-2`); raw exception text is not written into the event log or into any HTTP response.
- For every throw path above, the campaign never ends as `completed`, `no_violation_observed`, `pending` or `running`.

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
| `failed` | `error` | the verifier threw during the run (`verifier_error`), something else threw during the run (`run_error`), the confirming replay, control replay or export threw afterwards (`replay_error`), or the runner threw during construction after its row was written (`start_error`, stored row only; the API answers 500, §2a) |

- `status` is the existing `CampaignStatus` enum (`pending`, `running`, `stopped`, `completed`, `failed`). `pending` and `running` never appear for a finished campaign; `outcome` is `null` only while a campaign has no recorded outcome.
- On `failed` / `error` the event stream also contains a `system_error` event (`code` is `verifier_error`, `run_error`, `replay_error` or, for a stored row only, `start_error`) followed by a `campaign_state` event with `status: "failed"`.
- `finding` (possibly `null`) carries the finding status separately: `candidate`, `confirmed`, `not_reproduced` or `inconclusive`. A `confirmed` finding can sit on a `failed` / `error` campaign (the confirming replay promoted it, then the control replay or the export threw); the campaign error never downgrades the finding.
- `system_error.payload.logicalActionId` is a new optional field on the existing event schema.

## 2a. Control API error bodies (RB-021)

Every error body keeps `error` as a string and adds a typed `code`. The `error` text is fixed; it never carries raw exception text.

**Start error.** A throw while constructing the runner answers HTTP 500 with exactly:

```
{"error":"campaign could not be started","code":"start_error","campaignId":"<id>","status":"failed","outcome":"error"}
```

No session is registered; the UI should not open the stream for that id.

| HTTP | `code` | Where | `error` |
| --- | --- | --- | --- |
| 500 | `start_error` | `POST /api/campaigns`, the runner threw while being constructed | `campaign could not be started` |
| 409 | `campaign_exists` | `POST /api/campaigns`, the id is already in use | `campaign exists` |
| 500 | `campaign_record_missing` | `POST /api/campaigns`, the run returned but no campaign row was found | `campaign record missing after the run` |
| 404 | `campaign_not_found` | `GET /api/campaigns/:id` and `GET /api/campaigns/:id/events`, no session for that id (including after a `start_error`) | `campaign not found in memory` (GET), `campaign not found` (stream) |

The operator-token answers (401, and 503 when no token is configured), the stop endpoint's 404 and `GET /api/findings/:id`'s 404 are unchanged and carry no `code`. Fastify rejects a path parameter over 100 characters with its own 414 before the route runs.

## 3. A malformed target snapshot is a boundary input error

A structurally invalid snapshot (for example a negative balance, which `WorldStateSchema` rejects) is a boundary input (contract) error, not an invariant result. `evaluateTransitionInvariants` parses both snapshots at `packages/verifier/src/predicates.ts:297-298` and throws. With RB-020, that throw ends the campaign `failed` / `error` as above; it is never reported as INV-001 and never as a clean result. INV-001 is reported on well-formed state through `evaluateStateInvariants`, which turns a schema parse failure into INV-001 (RB-007, `efa178c`). `docs/verifier.md` carries the same note.

## 4. Tests

- `tests/integration/rb-020-terminal-status.test.ts` (5 tests). The verifier is wrapped so `verifyTransition` throws on demand; every other export is real.
  - scripted runner (`ScriptedCampaignRunner.run` and `runKnownFaultyScript`): `failed` / `error`, the action before the throw is kept, no `action_submitted` is left without its `action_completed` or `system_error`, nothing more is admitted;
  - control API, throw during the run: POST, GET and the `done` event all say `failed` / `error`, and GET is 200;
  - control API, throw during the replay: the same, with the finding still `candidate` and a `replay_error` event;
  - control API, a non-verifier throw during the run (the evidence store fails on the second action): POST, GET and `done` all say `failed` / `error`, with a `run_error` event that closes out the action;
  - control API without a throw: the same fields carry `completed` / `violation_confirmed` (faulty) and `completed` / `no_violation_observed` (fixed).
- `tests/integration/rb-021-honest-terminal-paths.test.ts` (10 tests). The target is wrapped so `execute` can throw on demand; the evidence store is spied on to throw; everything else is real.
  - scripted runner on its own: an evidence store throw and a target throw on the second action each end `failed` / `error` with one `run_error` that closes out `action-2`, the first action kept, no unclosed `action_submitted`, unique event sequences, and the throw rethrown; a malformed envelope ends `failed` / `error` with `verifier_error`; `recordFailure("replay_error")` after a run ends `failed` / `error` with the finding still `candidate`, and a second call is a no-op; a constructor throw after the row was written leaves the row `failed` / `error` with `start_error`;
  - control API: a target throw during the run gives `failed` / `error` on POST, GET and `done`, with `run_error`; a constructor throw before the row exists returns the exact `start_error` body with no raw exception text, then GET and the stream answer 404 `campaign_not_found`; a constructor throw after the row was written returns the same body, GET 404, and the stored row is `failed` / `error`; an over-long campaign id returns the same body; a repeated id answers 409 `campaign_exists`.
- `tests/verifier/rb-019-import-boundary.test.ts` gains one self-check (RB-019 review item N4): the scanner rejects a relative import that leaves the package and allows one that stays inside it.

## 5. Unchanged

The RB-015, RB-016, RB-017 and RB-018 bench outputs, snapshots and store rows are identical to main apart from wall time, the commit stamp and timestamps (the verifier never throws in those runs, and RB-021 keeps every rethrow). The RB-019 tests pass unchanged apart from the added N4 self-check.

Caps: offline only; synthetic fixtures; paid spend $0; the LLM arms are `not_run`; Thor-over-SSH runs are not `llm_dual` results; G4 is Not run; M13 is Partial; the pitch is not closed; this is not evidence of general exploit-detection performance and makes no security claim.
