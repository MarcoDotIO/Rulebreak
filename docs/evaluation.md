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

Out of scope until later work: a second failure family, which RB-016 (duplicate-reward fixture, `INV-006`) adds; reduced-trace length, which waits on RB-017; and any batch live (LLM) evaluation, which needs separate spend approval.
