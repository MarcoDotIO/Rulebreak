# Rulebreak evaluation evidence

Owner: Mnemosyne Archivist. This page indexes benchmark evidence. It does not copy result numbers. The contract sections linked below are the only source for them, so the numbers exist in one place.

The label conventions follow `AGENTS.md`: live, scripted, mocked or recorded. **Verified** means a result was reproduced and reviewed on the linked commit. **Not verified** means it was reported but not independently re-run.

## RB-015 seeded baseline (offline, $0)

Contract and results: [`docs/contracts/rb-015-baseline.md`](contracts/rb-015-baseline.md).

| Version | Contract | Runner | Code commit of the run | Results | Snapshot |
| --- | --- | --- | --- | --- | --- |
| v1 (historical) | #56 | #58 (main `047715a`) | `72f47af` | §8 | `docs/spikes/rb-015-offline-report*.json` |
| v2 (current) | #60 (main `47c8312`) | #63 (main `3e7123e`) | `3d5dd61` | §10 | `docs/spikes/rb-015-v2-offline-report*.json` |

The v1-only contract exports and tests were removed in #65 (main `f8427a6`). The v1 row above is history: its §8 results and snapshot are kept but can no longer be regenerated from current code. The contract's §9 is in force.

What the v2 run shows:

- The default plan has 2 offline arms (`scripted_known`, `seeded_random`), each run on the faulty and the fixed synthetic trade target with 5 seeds, for 20 runs in total. `validateComparisonV2` found no issues and no warnings, and both arms are `comparable` with a full budget.
- Both arms confirmed the planted defect (INV-003) on every faulty run. Neither arm confirmed anything on the clean (fixed) target.
- The v2 action sequences and outcomes are identical to v1. Only the new v2 fields (`stopReason`, `toolsUsed`) and the wall times differ.
- Plans and run records are stored in the insert-only `benchmark_comparisons` and `benchmark_runs` tables in `EvidenceStore` (§9.5). The report JSON is exported from those tables.

Review status:

- **Reviewed:** the contract and runner wording (Archivist), the boundary review (Wizard), the engineering review (EO), and the merge call (Chronomancer). Each is linked from its PR.
- **Not verified by Archivist:** the test counts, the typecheck result and the benchmark numbers. They come from the EO and Wizard runs recorded on #63 and #65, and Archivist has not re-run them.

Honesty caps, which apply to every RB-015 number:

- The runs are offline only, on the in-repo synthetic fixture with one planted defect. Paid spend is $0, and there are no LLM, network or Thor calls.
- `llm_single` and `llm_dual` are `not_run` because the live gate is not approved. They are not zero-finding results, and no claim is made comparing an arm against an LLM. Consumers must check `outcome` before `provenance`.
- Thor-over-SSH runs are not `llm_dual` results.
- The zeros on the clean target (false confirmations, candidates and `not_reproduced`) are **guaranteed by how the fixture is built, not measured**.
- `scripted_known` was written to hit this exact defect, so its faulty-target rate is expected by construction.
- `totalWallSeconds` depends on the machine.
- G4 is Not run, and the pitch is not closed. This is **not** evidence of general exploit-detection performance.

## RB-016 reward pair (offline, $0)

Contract and results: [`docs/contracts/rb-016-reward.md`](contracts/rb-016-reward.md) §7.

| Comparison | Fixture | Runner | Code commit of the run | Results | Snapshot |
| --- | --- | --- | --- | --- | --- |
| `rb-016-reward-offline-v1` | #68 (main `87160e5`) | #71 (main `ba768e2`) | `ac2802d` | §7 | `docs/spikes/rb-016-reward-report*.json` |

This is a separate comparison with its own settings key (rule pack `rulebreak-reward-v1`). It is not a rerun of RB-015 v2, and its results are not comparable with RB-015.

What the run shows:

- Only `scripted_known` runs, on the faulty and the fixed synthetic reward target with 1 seed. `validateComparisonV2` found no issues and no warnings.
- The scripted run confirmed `INV-006`, by construction. The fixed target produced no finding, with legitimate claims still granted.
- `seeded_random`, `llm_single` and `llm_dual` are `not_run` because no explorer has a `reward_claim` tool yet (RB-018). They have no result, which is not a zero result.
- `comparable` on `scripted_known` means complete within `rb-016-reward-offline-v1` only.

Review status:

- **Reviewed:** the §7 wording (Archivist), the boundary review (Wizard), product acceptance (Titan), and the merge call (Chronomancer), all on #71 at `beb0e0b`.
- **Not verified by Archivist:** the test counts, the typecheck result and the run numbers. They come from the EO and Wizard runs recorded on #71, and Archivist has not re-run them.

Honesty caps, which apply to every RB-016 number:

- `scripted_known` was hand-written to hit `INV-006` at action 4. It is not explorer-discovered and not a detection rate.
- The 0 false confirmations on the fixed target are guaranteed by how the fixture is built, not measured.
- Offline only, synthetic fixture with one planted defect, paid spend $0. Thor-over-SSH runs are not `llm_dual` results. G4 is Not run, and the pitch is not closed. Not evidence of general exploit-detection performance.

Out of scope until later work: a measured `seeded_random` arm on the reward pair, which is now RB-018 (separate comparison, below); reduced-trace length, which waits on RB-017; and any batch live (LLM) evaluation, which needs separate spend approval.

## RB-018 reward pair with `seeded_random` (offline, $0)

Contract and results: [`docs/contracts/rb-018-reward-tool.md`](contracts/rb-018-reward-tool.md) §4.

| Comparison | Tool boundary | Runner | Code commit of the run | Results | Snapshot |
| --- | --- | --- | --- | --- | --- |
| `rb-018-reward-offline-v1` | #73 (main `7467424`) | #75 (main `8e86f96`) | `9229ea2` | §4 | `docs/spikes/rb-018-reward-report*.json` |

This is a separate comparison. It shares its settings key with RB-016 (settings exclude the comparison id, arms and generator id) but it is not a rerun of RB-016 or RB-015, and its results are not comparable with either.

What the run shows:

- 40 planned runs: 4 arms, the faulty and fixed synthetic reward targets, and 5 plan-wide seeds. `validateComparisonV2` found no issues and no warnings.
- `seeded_random` (generator `rb018-seeded-random-reward-v1`): INV-006 confirmed on all 5 independent seeds on the faulty target, with the first-violation actions and the median of 5 seeds in §4. No finding on any of the 5 seeds on the fixed target, by construction.
- `scripted_known`: 5 repeats of one deterministic script, not 5 independent samples. It confirmed INV-006 in every repeat on faulty, by construction.
- `llm_single` and `llm_dual` are `not_run`: no result, which is not a zero result.
- `comparable` means complete within `rb-018-reward-offline-v1` only.

Review status:

- **Reviewed:** the wording (Archivist), the boundary re-check (Wizard), product sign-off (Titan), and the merge call (Chronomancer), all on #75 at `e2790e5`.
- **Not verified by Archivist:** the test counts, the typecheck result, the run numbers and the byte-identical RB-015 and RB-016 checks. They come from the EO and Wizard runs recorded on #75, and Archivist has not re-run them.

Honesty caps, which apply to every RB-018 number:

- Untuned default seeds against one planted defect; not a general detection rate.
- The fixed-target 0 is guaranteed by how the fixture is built, not measured.
- Offline only, synthetic fixture with one planted defect, paid spend $0. Thor-over-SSH runs are not `llm_dual` results. G4 is Not run, and the pitch is not closed. Not evidence of general exploit-detection performance.

Out of scope until later work: reduced-trace length, which waits on RB-017; and any batch live (LLM) evaluation, which needs separate spend approval.
