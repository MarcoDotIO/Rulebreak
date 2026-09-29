# RB-015 seeded baseline and comparison contract (v1)

Status: v1, merged in #56. Owner: Backend Architect Wizard. Depends on RB-013.
Acceptance: "Comparable settings and complete run outcomes" (`AGENTS.md` task table, RB-015 row). `docs/product.md` lists RB-015 as P1 after the P0 suite is green.
Schemas: `packages/contracts/src/benchmark.ts`. Tests: `tests/contracts/rb-015-benchmark.test.ts`.

This is an offline engineering check. It costs $0 and makes no claim that one arm finds defects better in general. Batch live (LLM) evaluation needs separate spend approval and is out of scope here.

## 1. Arms

| Arm | Runs offline | Provenance |
| --- | --- | --- |
| `scripted_known` | yes | `scripted` |
| `seeded_random` | yes | `recorded` |
| `llm_single` | no, live gate only | `live` |
| `llm_dual` | no, live gate only | `live` |

LLM arms must record `modelId`, `promptVersion` and `provider`. Until the live gate is approved, every LLM run in a plan is recorded as `not_run` with a reason. It is never left out and never counted as zero findings. Thor-over-SSH runs are not `llm_dual` results.

## 2. Seeds

There are two seeds, and they do different jobs.

- `worldSeed` is part of the comparable settings, so every run in a comparison starts from the same world. The initial state is also pinned by `initialStateHash`.
- `explorerSeed` drives the explorer's own choices. Each run has exactly one.

Rules:

- All explorer randomness comes from one seeded generator built from `explorerSeed`, whose id is recorded as `generatorId`. `Math.random`, wall-clock time and unseeded IDs must not influence choices. Domain time uses the virtual clock.
- The seed list (`explorerSeeds`) and the full run matrix (`plannedRuns`) are declared before the first run starts. Seeds cannot be added, dropped or replaced after results are seen.
- For offline arms, the same settings, arm config and `explorerSeed` must reproduce the same action sequence and `finalStateHash`. A mismatch is a bug, not a result. This holds only for runs that end on `maxActions` or a natural stop. A `maxWallSeconds` cutoff depends on the machine, so a wall-time-cut run can be compared only on the prefix it completed.

## 3. Comparable settings

These fields must be identical for every run in one comparison (`ComparableSettings`):

- `rulePackId` and `rulePackVersion`
- `worldSeed` and `initialStateHash`
- `resetProcedureId`
- `toolAccess` (compared order-insensitively)
- `maxActions`, `maxWallSeconds` and `spendCapUsd`

Each run stores `settingsKey = comparableSettingsKey(settings)`. Any mismatch fails the comparison.

The same budgets apply to every arm. The deterministic baseline must not be throttled, slowed or given a smaller budget.

Targets are not part of the settings. Instead, every plan must include at least one `faulty` target and at least one `fixed` (clean control) target. The matrix is arms × targets × seeds with no gaps.

## 4. Complete run outcome

Every planned run produces exactly one `RunRecord`, including failures. Each record has one terminal `outcome`:

| Outcome | Meaning |
| --- | --- |
| `confirmed_finding` | At least one finding reached `confirmed` through the RB-013 replay path (`matched_violation` on the same target build) |
| `candidate_only` | Candidates only, none confirmed |
| `no_finding` | The run finished within budget with nothing found |
| `budget_exhausted` | The run hit `maxActions` or `maxWallSeconds` |
| `error` | Harness or target error |
| `aborted` | Stopped by an operator |
| `not_run` | Planned but not executed. Requires `notRunReason`, with no actions and no findings |

When more than one outcome fits, the first match in this order wins: `confirmed_finding`, `error`, `aborted`, `budget_exhausted`, `candidate_only`, `no_finding`. The schema enforces the first one: any confirmed finding forces `confirmed_finding`. Findings are always kept in the record whichever outcome wins, so a run that finds candidates and then runs out of budget is `budget_exhausted` and still lists its candidates.

Each record also carries `actionsTaken`, `wallSeconds` and `costUsd`, which are reported separately and never merged. It carries its findings, each with status, invariant and `firstActionIndex`, and `finalStateHash` when available.

A confirmed finding on a `fixed` target counts as a clean-target false confirmation.

## 5. Report validation

`validateComparison` must return no issues before any arm-against-arm number is shown. It rejects:

- a missing run, a duplicate run or an unplanned run
- a settings mismatch
- a matrix gap
- a missing faulty target or a missing clean control
- spend over the cap, or actions over the budget
- an offline arm with `live` provenance, or an executed LLM arm without `live` provenance

`summarizeArms` reports, per arm:

- planned, executed and not-run counts
- confirmed runs on faulty targets
- false confirmations on clean targets
- errors and aborted runs
- distinct invariants confirmed on faulty targets (`distinctInvariants`)
- the median count of actions to the first confirmed finding, which is `firstActionIndex + 1`
- total spend and total wall time

It marks an arm `comparable: true` only when every planned run for that arm executed. Here "executed" means any outcome except `not_run`. `error` and `aborted` runs count as executed, so they stay in the denominators and are reported. They are never dropped to make an arm look better.

Repeated confirmations of the same fixture defect count as instances, not new defect classes. Distinct classes are counted by `invariantId`, and that count is `distinctInvariants`.

## 6. Out of scope for v1

- Reduced-trace length. This waits on the reducer.
- Candidate replay fraction beyond what finding status already gives.
- Any live or LLM execution.

These arrive in a later schema version, not as optional fields added quietly.

## 7. Storage

In v1, plans and run records are written only to the report JSON (`ComparisonReport`, see §8). Every campaign, action and finding a run produces still goes through the existing evidence store (`EvidenceStore`), and there is no second store. Benchmark tables in the evidence store are planned for v2. Evidence summaries go to Archivist for `docs/evaluation.md`.

## 8. Offline runner (v1)

Code: `packages/campaign/src/benchmark-runner.ts` (`runComparison`, `buildDefaultOfflinePlan`). CLI: `scripts/bench-rb015.ts`. Tests: `tests/benchmark/rb-015-offline-runner.test.ts`.

```bash
source ~/.nvm/nvm.sh && nvm use 26.5.0
npm run bench:rb015                    # default plan -> artifacts/rb-015/offline-report.json (gitignored)
npm run bench:rb015 -- --with-llm-arms # also plans llm_single/llm_dual cells, recorded as not_run
npm run bench:rb015 -- --out <path> --seeds a,b,c --max-actions 200
```

The CLI writes three files: the `ComparisonReport` JSON, a `.summary.json` (with the honesty caps and the code commit it ran at) and a `.traces.json` (the recorded action sequence per run). It prints and writes `summarizeArms` output only after `validateComparison` returns `[]`. Otherwise it prints the issues, writes nothing and exits non-zero.

How it runs:

- Default plan: `scripted_known` + `seeded_random` × `synthetic-trade-faulty` + `synthetic-trade-fixed` × 5 explorer seeds (20 runs). `worldSeed` is `rulebreak-v0-default`, `initialStateHash` is computed from the reset procedure `rb015-fresh-adapter-initialize-v1`, rule pack is `rulebreak-trade-v1@1.0.0`, and all five explorer tools are allowed. `maxActions` is 200, `maxWallSeconds` is 60 and `spendCapUsd` is 0 for every run.
- Target check: before any action, a run ends as `error` unless the target's `buildId` is `RB015_BUILD_ID` (`rulebreak-economy-0.1.0`) and its `targetId` is `synthetic-trade-faulty` for a `faulty` target or `synthetic-trade-fixed` for a `fixed` target. This makes the replay path's hard-coded `synthetic-trade-*` labels a checked fact.
- Each run resets a fresh in-process fixture adapter and checks the reset hash against `initialStateHash`. A mismatch is recorded as `error`. Actions go through the existing `ScriptedCampaignRunner.submit` path (verifier, then evidence store). The first violation freezes the run. The candidate is then confirmed through the RB-013 path (`loadBundleFromStore` → `replayBundle` on the same fixture build → `applyConfirmingReplay`).
- `sameBuildConfirmation` (a new `replayBundle` option, off by default): on a `fixed` replay, a reproduced violation with the same `invariantId` as the recorded one is reported as `matched_violation` instead of the control-style `error`. It still needs that same invariant; any other violation stays `error`. With it off, RB-008 fixed-control replay behaves exactly as before. The runner turns it on, so a fixed-target reproduction would be counted as a clean-target false confirmation instead of being hidden as `not_reproduced`.
- `scripted_known` runs `knownTradeFailureSteps()` (create → accept → cancel). It ignores `explorerSeed`, so its seeds are identical replicates.
- `seeded_random` (`generatorId` `mulberry32-fnv1a32-v1`) keys mulberry32 from `fnv1a32("<generatorId>|<explorerSeed>")`. It picks the actor, the tool (from the sorted `toolAccess`) and the args (item id or a decoy, counterparty, price, and a trade id from the actor's bound public view or a decoy). Rejected tool args still count as actions. `Math.random` and wall-clock time never influence a choice. The clock is read only for `wallSeconds` and the `maxWallSeconds` cutoff.
- `llm_single` and `llm_dual` are never executed. Every planned LLM cell is recorded as `not_run` with `notRunReason` "live gate not approved…", no actions, no findings and $0. `not_run` rows carry `live` provenance per §1. Consumers, including UIs, must check `outcome` before `provenance`.
- `firstActionIndex` is the 0-based index in the run's counted action sequence (tool calls, including observes and notes), not the persisted mutation sequence.

Results (`docs/spikes/rb-015-offline-report*.json`). The run is from code commit `72f47af877842947eaa4758237b39a0a1b25d15d`, which is also stamped in `.summary.json`. The commit after it adds only these docs and the regenerated snapshot. Run on 2026-09-29, macOS, Node 26.5.0.

| arm | planned | executed | notRun | faultyConfirmed / faultyRuns | cleanFalseConfirmations / cleanRuns | errors | aborted | distinctInvariants | medianActionsToFirstConfirmed | totalCostUsd | totalWallSeconds | comparable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| scripted_known | 10 | 10 | 0 | 5 / 5 | 0 / 5 | 0 | 0 | 1 (INV-003) | 3 | 0 | 0.011 | true |
| seeded_random | 10 | 10 | 0 | 5 / 5 | 0 / 5 | 0 | 0 | 1 (INV-003) | 83 | 0 | 0.085 | true |

With `--with-llm-arms` at the same commit, both LLM arms show `planned 10, executed 0, notRun 10, comparable false`, and the offline rows are unchanged.

Per run: `scripted_known` confirmed INV-003 at action 3 on all 5 faulty runs and ended `no_finding` after 3 actions on all 5 fixed runs. `seeded_random` confirmed INV-003 on faulty after 194, 58, 150, 83 and 65 actions (seeds 01–05). On fixed it ended `budget_exhausted` at 200 actions on all 5 runs. Seed 01 came within 6 actions of the budget, so a smaller `maxActions` would change that row. `totalWallSeconds` depends on the machine. It is the only column that changed from the earlier run at `302d27d`.

Honesty caps:

- Offline only, on the in-repo synthetic trade fixture with a single planted defect. Paid spend: $0. No LLM, network or Thor calls.
- `llm_single` and `llm_dual` are `not_run` because the live gate is not approved. They are not zero-finding results, and no arm-vs-LLM claim is made.
- Thor-over-SSH runs are not `llm_dual` results.
- G4: Not run. The pitch is not closed.
- 0 clean-target false confirmations is guaranteed by how the fixture is built, not measured. `synthetic-trade-fixed` has no reachable invariant violation, so a fixed run never produces a candidate to confirm. That holds whether `sameBuildConfirmation` is on (as in this runner) or off (the default, where a fixed replay cannot report `matched_violation` at all).
- `scripted_known` was written to hit this exact defect, so its 5/5 faulty-target rate is expected by construction.
- This is not evidence of general exploit-detection performance.

Known v1 gaps are tracked in the parked "RB-015 contract v2" item (owner: Wizard): a `not_reproduced` run outcome (today a demoted finding lands in `no_finding`), a flag for wall-time-cut runs in `validateComparison`, a `toolAccess` vs arm check, and benchmark tables in the evidence store.

## 9. Contract v2 (RB-015-v2)

Status: draft for review. Owner: Backend Architect Wizard. Schemas: `packages/contracts/src/benchmark-v2.ts`. Tests: `tests/contracts/rb-015-v2-benchmark.test.ts`.

v2 is added next to v1, not in place of it. The v1 exports and the v1 runner stay unchanged until the runner moves to v2. After that, v1 can be removed in its own PR. Every v2 report and record carries `contractVersion: 2`, so a v1 artifact can never be read as v2.

### 9.1 `not_reproduced` outcome

A run whose candidate was replayed through the RB-013 path and came back `not_reproduced` or `inconclusive` now ends as `not_reproduced`. In v1 it landed in `no_finding`.

The full order of precedence is `confirmed_finding`, `error`, `aborted`, `not_reproduced`, `budget_exhausted`, `candidate_only`, `no_finding`. `resolveOutcomeV2` implements that order.

`no_finding` can no longer carry any findings, so a demoted finding can't be hidden behind it. The summary counts these runs as `faultyNotReproduced`.

### 9.2 Stop reason and wall-time cutoffs

Every v2 record has a `stopReason`: `natural`, `first_violation`, `max_actions`, `max_wall_seconds`, `operator_abort`, `error` or `not_run`. The schema makes the outcome and the stop reason agree:

- `budget_exhausted` needs `max_actions` or `max_wall_seconds`.
- `aborted` needs `operator_abort`.
- `error` needs `error` and an `errorMessage`.
- `not_run` needs `not_run`.
- The other outcomes can't use any of those stop reasons.

A `max_wall_seconds` stop is reported by `validateComparisonV2` as a `wall_time_cutoff` warning. A warning doesn't block the comparison, but it has to be shown next to the numbers. Wall-time stops depend on the machine, so the same-seed reproduction rule in §2 covers only the part of the run completed before the cutoff. The summary counts them as `wallTimeCutoffs`.

An exploring arm on a clean target normally ends as `budget_exhausted` with stop reason `max_actions`. That is the expected clean-control result, not a failure.

### 9.3 Tool access

Every record lists `toolsUsed`: the distinct tools the arm actually called, including calls rejected at the tool boundary. `validateComparisonV2` rejects a record with `tool_outside_access` if any of them isn't in `settings.toolAccess`. The runner still stops such a run as `error`. The validator makes the same rule checkable from the report alone.

### 9.4 Validator and summary fixes

- A cell planned twice is reported as `duplicate_planned_cell`. In v1 it came out as `unplanned_cell`.
- `run_plan_mismatch` now also compares `buildId` and `fixtureMode`, not just `targetId`.
- `summarizeArmsV2` marks every arm `comparable: false` while `validateComparisonV2` returns any issue. A summary can no longer look comparable when validation has failed.
- A `not_run` record can't carry actions, tools, findings or spend.

### 9.5 Benchmark tables in the evidence store

These two tables go in the existing `EvidenceStore` SQLite schema (`packages/evidence/src/sqlite-store.ts`). They are not a second store. EO implements them together with the v2 runner change.

```sql
CREATE TABLE IF NOT EXISTS benchmark_comparisons (
  comparison_id    TEXT PRIMARY KEY,
  contract_version INTEGER NOT NULL CHECK (contract_version = 2),
  settings_key     TEXT NOT NULL,
  plan_json        TEXT NOT NULL            -- ComparisonPlan, canonical JSON
);

CREATE TABLE IF NOT EXISTS benchmark_runs (
  comparison_id  TEXT NOT NULL REFERENCES benchmark_comparisons(comparison_id),
  run_id         TEXT NOT NULL,
  arm            TEXT NOT NULL,
  target_id      TEXT NOT NULL,
  explorer_seed  TEXT NOT NULL,
  outcome        TEXT NOT NULL,
  stop_reason    TEXT NOT NULL,
  campaign_id    TEXT REFERENCES campaigns(campaign_id),  -- NULL for not_run
  record_json    TEXT NOT NULL,           -- RunRecordV2, canonical JSON
  PRIMARY KEY (comparison_id, run_id),
  UNIQUE (comparison_id, arm, target_id, explorer_seed)
);
```

Rules:

- The plan row is written once, before the first run starts, and is never updated. This keeps the rule from §2 that seeds can't be added after results are seen.
- Run rows are insert-only. The primary key and the `UNIQUE` constraint enforce one record per planned cell in the database itself.
- `record_json` has to parse as `RunRecordV2`. The indexed columns are copies of fields in it and must match. The JSON is authoritative.
- `campaign_id` links a run to the campaign, action and finding rows it produced. That link is `<comparisonId>--<runId>`, as in v1.
- The report JSON is derived by reading these tables back. It is an export, not a second source of truth.

Out of scope for v2: reduced-trace length (it waits on RB-017), and any live or LLM execution. The same honesty caps as v1 apply: offline only, $0, LLM arms `not_run`, Thor runs are not `llm_dual`, G4 is Not run, and the pitch is not closed.
