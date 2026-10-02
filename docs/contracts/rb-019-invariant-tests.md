# RB-019 — broader independent invariant tests

Status: tests only (Backend Architect Wizard). Reviewers: Engineer Overlord (verifier owner), Mnemosyne Archivist (wording). Offline, $0. No source file under `packages/` changes.

Results here describe these hand-built cases and these fixed seeds on the in-repo synthetic fixtures. They are not a claim that the verifier is correct in general or that its coverage is complete.

## 1. Single-field corruptions (`tests/verifier/rb-019-single-field-corruption.test.ts`)

Every case runs under `APPROVED_RULE_PACK_REWARD_V1`, so all six invariants are enabled and "caught by no other invariant" is a real check. A helper counts differing leaf paths and asserts each corruption changes exactly one field of the hand-built input. Each case asserts the valid input reports nothing and the corrupted input reports exactly one invariant id.

| Invariant | Valid input | Single-field corruptions (each reports only this invariant) |
| --- | --- | --- |
| INV-001 (state) | two-player, two-item world | negative balance; balance above `MAX_CURRENCY`; fractional `nextTradeSeq`; negative `virtualClock` |
| INV-002 | accepted `strategy_note` (clock only) | post balance minted; post balance burned |
| INV-003 (state and transition) | same world / same note | second item renamed onto the first |
| INV-004 | note after an accepted trade | accepted trade moved to `cancelled`; accepted trade moved back to `open` |
| INV-005 | atomic `trade_accept` | item left with the seller; outcome changed to `domain_rejected`; accept of a trade that was not open |
| INV-006 | in-policy `reward_claim` | grant above the policy ceiling; points granted to the other player; claim attributed to the other actor; points moved on a rejected claim |

Observation for the verifier owner, not a bug report: INV-001 is checked through `evaluateStateInvariants`. On the transition path, `evaluateTransitionInvariants` parses both snapshots first and throws on a structurally invalid one, so a negative balance there is refused by throwing rather than reported as INV-001. A test pins that it fails closed.

A local mutation check (each of `checkInv002`, `checkInv003`, `checkInv004`, `checkInv005` and `checkInv006Transition` stubbed to return null, one at a time, not committed) made these tests fail every time.

## 2. Seeded legitimate sequences (`tests/verifier/rb-019-legitimate-sequences.test.ts`)

- Generator `rb019-mulberry32-fnv1a32-legit-v1`, written in the test file. It reads the coordinator snapshot to choose moves; that is test-side code and never reaches the verifier.
- Seeds: `rb019-trade-01` … `rb019-trade-20` on the fixed trade target, and `rb019-reward-01` … `rb019-reward-20` on the fixed reward target. 40 steps per sequence.
- Moves are legitimate calls the rules allow (create by the owner, accept by the buyer, cancel by the seller while open, one reward claim per player) with a fixed 0.2 share of rule-refused calls (wrong actor, unaffordable, already settled, already claimed). The test asserts the fixed target accepts or refuses each move as expected, so the sequences are what they claim to be.
- Each step runs `verifyTransition` and `evaluateStateInvariants` on the post state.

Results (counts pinned in the test):
- Trade: 20 generated sequences on fixed seeds, 800 steps; accepted 322 creates, 158 accepts, 153 cancels; 167 refused calls. No violations reported.
- Reward: 20 generated sequences on fixed seeds, 800 steps; accepted 292 creates, 153 accepts, 128 cancels, 40 reward claims; 187 refused calls. No violations reported.
- Control (by construction): the same generator on the faulty trade fixture reaches a violation on at least one seed, because its rule-refused "cancel after acceptance" call is accepted there. This only shows the harness is not blind; it is not a detection rate.

## 3. Import boundary (`tests/verifier/rb-019-import-boundary.test.ts`)

- Every module specifier in `packages/verifier/src` (static, side-effect, dynamic `import()`, `require()`) is `@rulebreak/contracts`, `node:crypto`, or a relative path that stays inside the package.
- Transitively, `packages/contracts/src` imports only `zod` and its own files.
- `packages/verifier/package.json` declares only `@rulebreak/contracts`, with no dev, peer or optional dependencies.
- A self-check feeds the scanner each import form with a forbidden target and asserts it is found.

## 4. Unchanged

No verifier bug was found, so there is no fix PR. Nothing under `packages/`, `scripts/` or the RB-015, RB-016, RB-017 and RB-018 artifacts changes; this PR adds three test files and this document.

Caps: offline only; paid spend $0; the LLM arms are `not_run`; G4 is Not run; M13 is Partial; the pitch is not closed.
