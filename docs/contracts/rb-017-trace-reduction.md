# RB-017: bounded trace reduction

Status: built by Engineer Overlord. Replay-boundary review: Backend Architect Wizard. Wording: Mnemosyne Archivist. Offline only, $0.

Acceptance (Titan): reduce the 5 confirmed `seeded_random` traces on synthetic-reward-faulty from `rb-018-reward-offline-v1` by deleting ranges of actions. Every attempt is replayed from the original starting state. A result counts only when the independent verifier confirms the same INV-006 violation with the same actors, objects and ids. Each result is reported as "reduced", never as minimal. The RB-015, RB-016 and RB-018 artifacts stay byte-identical.

## 1. Inputs

- **Source files:** the committed RB-018 snapshot, `docs/spikes/rb-018-reward-report.json` and `docs/spikes/rb-018-reward-report.traces.json`. The artifact records the sha256 of both files.
- **Rebuilding the evidence:** the committed traces file holds each run's calls as `actor:tool:args` strings. It does not hold the evidence bundle (initial state, recorded results and state hashes, violation). So `buildRb017Reduction` reruns the plan stored inside the committed report, in memory, and loads each run's bundle with `loadBundleFromStore`. Two checks make sure the bundle really belongs to the committed trace, and the build fails if either one fails:
  - the rerun's traces must equal the committed traces exactly;
  - every bundle action must match its committed call string, at the counted position given by its `logicalActionId`.
- **Inputs to the reducer:** the 5 confirmed `seeded_random` runs on synthetic-reward-faulty (seeds `rb018-seed-01` to `rb018-seed-05`). Their first violations were at counted actions 37, 108, 32, 18 and 35.
- **Control:** `scripted_known--faulty--rb018-seed-01`, labelled as a control. It is the 4-action hand-written script, so its result holds by construction and it is not an input. The other four scripted_known repeats are identical and are not repeated.
- **Counted actions versus replayed actions:** some counted explorer actions never reach the target: `economy_observe` reads and `strategy_note` calls. They are not in the evidence bundle, so they have no replay to run. The reducer works on the actions that reached the target (the bundle's actions). The artifact reports both numbers, and it counts the dropped actions by tool.

## 2. The reducer (`packages/replay/src/reduce.ts`)

- **Search:** range deletion (the complement step of ddmin).
  - The violating action is always kept as the last action.
  - The reducer first tries to remove every earlier action at once, then halves, quarters and so on, down to single actions.
  - When a removal is accepted, the number of ranges drops by one and the scan starts again. When no range at the current size can be removed, the size halves.
  - It stops when no single remaining action can be removed, when only the violating action is left, or when a bound is reached.
- **Replay:** every candidate goes through the existing replay path: `replayBundle` on the faulty reward build, with `targetFamily: "reward"` and rule pack `rulebreak-reward-v1`. Each replay starts from a fresh target initialised from the bundle's initial state, and every step is checked by the independent verifier (`verifyTransition`).
  - The replay path is not weakened. RB-017 adds one read-only option, `onStep`, which reports each step's replayed result and verification. It cannot change the replay: with it unset, `replayBundle` behaves exactly as before, and the RB-015, RB-016 and RB-018 snapshots confirm this (section 5).
- **Bounds:** at most 100 replays per trace, counting the baseline replay of the original, and a wall-clock timeout of 10,000 ms per trace. Both can be changed with `--max-replays` and `--max-wall-ms`.
- **Offline and deterministic:** no model, network or Thor calls, and no platform randomness. Wall-clock time is read only for the timeout; no reduction in this run came near it. The committed artifact carries no time or commit fields, and a test checks that a fresh build is byte-identical to it.

## 3. What counts as reduced

**Baseline.** The original trace is replayed first, with per-step hashes required to match the recorded run (`requireHashMatch`). If this baseline fails, the trace is reported as not reduced.

**Acceptance rules.** A candidate is accepted only if all of these hold:
1. `replayBundle` returns `matched_violation` for the bundle's invariant (INV-006).
2. The first violation the verifier reports is on the bundle's violating action: same `logicalActionId` and same invariant. That action must be the candidate's last action.
3. Every kept action replays with the same `outcome`, `domainCode` and `message` as recorded in the original run.

**Why rule 3 matters.** Kept actions are the original objects, with the same `logicalActionId`, actor and parameters. Rule 3 means:
- a failed precondition rejects the candidate (for example, a reused idempotency key that is now granted instead of refused);
- a missing setup object rejects it (for example, a trade accept whose trade was removed);
- a changed object id rejects it (trade ids appear in the result message).

**Candidates are not hash-matched.** Hashes cannot match once earlier actions are removed, so only the baseline uses `requireHashMatch`.

**Status.** A trace is "reduced" when at least one removal was accepted, and "not reduced" otherwise. Results are never called minimal: the search is bounded and only deletes ranges, so a shorter trace may exist.

## 4. Results (offline, $0)

Run: `npm run reduce:rb017 -- --out docs/spikes/rb-017-reduced-traces.json`. The artifacts are `docs/spikes/rb-017-reduced-traces.json`, which holds each original trace next to its reduced trace plus every attempt, and `docs/spikes/rb-017-reduced-traces.summary.json`.

| Trace | Role | Original counted actions | Actions that reached the target | Reduced length | Replays used (cap 100) | Stopped because |
| --- | --- | --- | --- | --- | --- | --- |
| `seeded_random--faulty--rb018-seed-01` | input | 37 | 26 | 2 | 22 | no single remaining action could be removed |
| `seeded_random--faulty--rb018-seed-02` | input | 108 | 71 | 2 | 25 | no single remaining action could be removed |
| `seeded_random--faulty--rb018-seed-03` | input | 32 | 22 | 2 | 12 | no single remaining action could be removed |
| `seeded_random--faulty--rb018-seed-04` | input | 18 | 15 | 2 | 9 | no single remaining action could be removed |
| `seeded_random--faulty--rb018-seed-05` | input | 35 | 24 | 2 | 15 | no single remaining action could be removed |
| `scripted_known--faulty--rb018-seed-01` | control (hand-written, by construction) | 4 | 4 | 2 | 8 | no single remaining action could be removed |

Caveat for every row: untuned default seeds against one planted defect; not a general detection rate.

**What is left.** Every reduced trace is two reward claims by the same player:
- one granted claim;
- the violating claim, a second grant of the same reward under a different idempotency key.

In each seeded_random trace the violating claim uses a key from the other player's pool or a second key of the player's own.

**Rejected attempts.** These included:
- candidates where the violation no longer reproduced;
- changed preconditions, such as a reused key that was granted instead of refused;
- trade actions whose trade no longer existed.

Lengths are per trace only. There are no averages, medians or rates across traces.

## 5. Artifacts that must not change

- **Benches:** `bench:rb015`, `bench:rb016` and `bench:rb018` produce the same reports, summaries, traces, stdout and store rows as on main, apart from wall time, the commit stamp and timestamps.
- **Snapshots:** the committed RB-015 v2, RB-016 and RB-018 snapshot files are not modified.
- **Guard tests:** the existing snapshot guard tests still pass.

## 6. Caps

- Offline only. Paid spend $0.
- The LLM arms are `not_run`.
- Thor-over-SSH runs are not `llm_dual` results.
- G4 is Not run. M13 is Partial. The pitch is not closed.
- This is not evidence of general exploit detection, and it makes no security claim.

## 7. For the replay-boundary review

- **The `onStep` observer on `replayBundle`.** It is additive and read-only, and it is called after verification.
- **Baseline hash matching.** The baseline replay uses `requireHashMatch`, but candidates do not, and cannot. Rule 3's per-step result equality is the substitute check.
- **The initial-state fallback.** `replayBundle` still has its existing fallback for a start-state hash mismatch, and it is unchanged. For these inputs, the baseline hash match shows that the start state agrees with the recorded run.
- **The action result `message` in rule 3.** It is compared as part of the result, so this depends on the target reporting object ids (trade ids, reward ids) in `message`.
