# Rulebreak — Product Requirements (RB-001)

**Status:** Proposed for review (Product Manager Titan)  
**Date:** 2026-09-15  
**Charter source:** `AGENTS.md` §§1–3, 7, 19, 21  
**Audience:** SCRUM development bots; Marco is stakeholder

This document freezes P0 product intent for the first milestone. It does not describe software that already exists. Technical contracts live in RB-005+; this file defines *what must be true for a user* and what we refuse to build.

---

## 1. Product pitch (one paragraph)

Rulebreak helps game-backend engineers, technical QA, and economy designers find **reproducible economic rule violations** in an authorized test target before players do. Two account-bound explorers take ordinary trade actions; **independent deterministic code**—not a model story—decides whether an approved rule broke. The primary deliverable is an **evidence package**: exact action sequence, violated rule ID, before/after state, offline replay, and a regression test that fails on the faulty target and passes on the fixed one while legitimate trading still works. The UI explains that evidence; it is not the source of truth.

---

## 2. Primary user and job-to-be-done

| | |
| --- | --- |
| **Primary user** | Game-backend engineer, technical QA, or economy designer working with an engineer |
| **Job** | Answer: “Can combinations of normal actions produce outcomes this economy forbids?” |
| **Success** | A confirmed finding with offline replay + exportable safety regression, or an honest “no confirmed violation within this budget” with clear mode labels |

**Unvalidated hypothesis (record, do not oversell):** Multi-account exploration plus reproducible evidence may help studios triage economic logic failures. Whether LLM-guided search beats conventional testing is **unproven** and must be measured. Property-based or scripted discoveries remain valid results; do not relabel them as model discoveries.

---

## 3. First milestone (demo center of gravity)

Build the smallest complete system that can:

1. Execute a **known trade-failure sequence** against the bundled synthetic economy (scripted driver first).
2. Detect the violated economic rule with **independent deterministic code**.
3. Preserve evidence and **reproduce the failure offline**.
4. Export a **safety regression test** that fails on the faulty target, passes on the fixed target, and keeps legitimate trading green.

**Demo spine (maps to `AGENTS.md` §3):** problem (unique-item location rule) → exploration (labeled live / scripted / recorded) → evidence (action, discrepancy, invariant, fresh replay) → regression (faulty red / fixed green + legitimate trades) → close (exports, cost/time honesty, synthetic-target limit).

Live discovery in a live slot is **not** guaranteed. Prefer a previously captured, clearly labeled **Recorded replay** over fabricating live events.

---

## 4. P0 acceptance criteria (product contract)

A P0 feature is accepted only when it produces a **user-visible or operator-checkable** outcome below. Charter table in `AGENTS.md` §2 remains authoritative; this restates it as testable product gates.

| ID | Capability | Acceptance (must observe) |
| --- | --- | --- |
| AC-01 | Synthetic economy | Two players, integer currency, one unique item, escrow, create/accept/cancel; initial world per charter §6 |
| AC-02 | Dual targets | Faulty and fixed implementations of the **same** public contract; target chosen before campaign start |
| AC-03 | Independent verifier | After each committed action, checks INV-001–INV-005 from approved rules; never uses target mutation handlers as oracle |
| AC-04 | Scripted vertical slice | Known trade-failure sequence labeled **scripted**; persists actions, violation, stop; no model required |
| AC-05 | Evidence package | Initial state, exact command trace, results, state hashes, rule ID, target/version metadata |
| AC-06 | Offline replay | Fresh vulnerable target reproduces the recorded violation **without** a model call |
| AC-07 | Regression export | Deterministic safety test: red on faulty, green on fixed; legitimate create/accept/cancel still pass on fixed |
| AC-08 | Honest negatives | Fixed-target runs and legitimate workflows produce **no confirmed false findings** in the acceptance suite |
| AC-09 | Provenance labels | UI and exports distinguish **live**, **scripted**, and **recorded replay**; candidate vs confirmed vs inconclusive cannot be confused |
| AC-10 | Campaign controls | Bounded budget, stop, durable progress, explicit terminal outcomes; reconnect does not duplicate timeline entries |
| AC-11 | AgenC live path | Two separately bound agent sessions on different player accounts via restricted tools; genuine tool round-trips; no source/solution leakage to explorers |
| AC-12 | UI evidence flow | Operator can start a campaign, follow activity, open a finding, see broken rule + responsible action + replay result **without narration** |
| AC-13 | Boundaries | Live remains blocked until isolation/spend gates pass; explorers cannot reset world, read private fixtures, or confirm findings |
| AC-14 | Fresh-checkout offline | Documented commands run offline demo/tests without ambient provider credentials |

**Confirmation rule:** Only a successful independent replay promotes `candidate` → `confirmed`. A model cannot veto a deterministic violation or declare a campaign clean.

**P0 invariants in scope:** `INV-001`…`INV-005`. `INV-006` is P1.

---

## 5. Explicit exclusions (do not build in P0)

| Out | Why |
| --- | --- |
| General-purpose agent platform / custom model serving / training | Wrong product; charter forbids |
| Graphical game, browser gameplay, blockchain, wallets, token incentives | Not the job-to-be-done |
| Public exploit marketplace, auto production patching, multi-tenant SaaS billing | Scope and safety |
| Universal adapter for every engine / first real production game backend | Synthetic bundled target only until Marco approves otherwise |
| Calling a sequential trade-lifecycle bug a “race condition” | Real concurrency testing is out of P0 |
| Trusting model prose or target ledger text as proof | Agents search; code verifies |
| Weakening invariants to green a faulty fixture | Change rules only via product + domain owners; version the rule pack |
| Claiming “secure” from a bounded clean run | Report “no violation observed within budget” |

**Cut order if time is short** (keep core claim): drop crafting, extra fixtures, reporting model, automated trace reduction, broad benchmarks, nonessential polish. **Never cut without Marco:** authorized boundaries, independent verifier, original trace, offline replay, clear provenance, real AgenC integration path.

---

## 6. User journey (operator)

1. Select bundled target + approved rule pack + budget; start campaign.  
2. Watch accepted/rejected actions, account views, verification results (mode clearly labeled).  
3. On rule break: exploration freezes; trace preserved.  
4. Replay from original state → promote finding only if replay succeeds.  
5. Replay same trace on fixed target; confirm rules hold and normal trading still works.  
6. Export regression test + evidence bundle.

---

## 7. Backlog sequencing proposal (for Scrum Master Chronomancer)

Preserve dependencies in `AGENTS.md` §19. Product reordering notes:

| Now | Rationale |
| --- | --- |
| Unblock **RB-005** immediately after this PRD review | Contracts are the critical path for economy, verifier, and UI mocks |
| Keep **RB-002 → RB-003** and **RB-004** parallel; RB-004 gates **live** RB-003 sign-off only | Offline deterministic slice must not wait on live |
| Scripted path **RB-006 → RB-007 → RB-008 → RB-009** before celebrating UI polish | Dashboard alone is not the milestone |
| **RB-010** mocks OK against frozen schemas; real stream after RB-008/RB-009 | Matches Goblin’s current claim |
| Integration checkpoint #1 | Scripted known failure → independent check → persisted evidence (not “all docs done”) |

P1 (after P0 acceptance suite green): RB-015 baseline, RB-016 duplicate-reward, RB-017 trace reduction.

---

## 8. Decisions still requiring Marco (defaults while open)

| Topic | Default now |
| --- | --- |
| Exact deadline / presentation constraints | Three-day plan is assumption only |
| Spend / live model execution | Live disabled until approved |
| Publication / deployment | Local offline demonstration |
| First real game-backend integration | Bundled synthetic target only |
| Distribution license | Do not infer from dependencies |

No material scope change in this PRD beyond what `AGENTS.md` already settles.

---

## 9. Review and Done evidence (RB-001)

| Check | Evidence |
| --- | --- |
| Every P0 AC maps to a §3 user-visible demo beat or operator check | Sections 3–4 of this file |
| Critical path has no unapproved integration | AgenC live gated; scripted path is primary slice |
| Exclusions and cut order explicit | Section 5 |
| Reviewers | @Engineer Overlord (feasibility / critical path), @UI Design Goblin (journey / evidence UX) |

**Done when:** both reviewers sign off in-room (or note actionable deltas), this file is on an RB-001 branch/PR, and Chronomancer can treat RB-005 as unblocked.
