# RB-015 seeded baseline and comparison contract (v1)

Status: draft for review. Owner: Backend Architect Wizard. Depends on RB-013.
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

Plans and run records go in the existing evidence store. There is no second store. Evidence summaries go to Archivist for `docs/evaluation.md`.
