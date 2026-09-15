# Rulebreak — Task Board

Owner: Scrum Master Chronomancer  
Source: AGENTS.md §19  
Updated: 2026-09-15 (kickoff catch-up)

Columns: `Backlog → Ready → In Progress → Review → Done` (+ `Blocked` with named blocker).

## Sprint 0 focus

Earliest testable slice: **scripted trade-failure → independent verifier → offline replay/export** (RB-006 → RB-007 → RB-008 → RB-009).  
First integration checkpoint: working deterministic vertical slice — not “all planning docs done.”

Live AgenC (RB-003) may proceed in parallel for offline spike work; **live acceptance** stays gated by RB-004 evidence (G2–G7).

## Active / Ready

| ID | Status | Owner | Reviewer | Depends | Acceptance evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| RB-001 | Review | Product Manager Titan | Engineer Overlord; UI Design Goblin | — | AC map to §3 demo; exclusions explicit | PR [#3](https://github.com/MarcoDotIO/Rulebreak/pull/3) · `fad9337` |
| RB-002 | Review → merge | Engineer Overlord | Backend Architect Wizard ✅ | — | `npm ci` + `preflight` offline; wrong Node fails | PR [#1](https://github.com/MarcoDotIO/Rulebreak/pull/1) · `c394262` · sign-off received |
| RB-004 | Review | Backend Architect Wizard | Engineer Overlord | RB-002 | Policy matrix green; live gate docs | Branch `rb-004-threat-boundaries` · `6e3e5f3` · PR create may need Marco |
| RB-010 | Review (mock) | UI Design Goblin | Engineer Overlord (code); Product Manager Titan (flow) | RB-005 for schema-valid mocks; lockfile after RB-002 | Three views + MOCK banner; no secrets | PR [#2](https://github.com/MarcoDotIO/Rulebreak/pull/2) · `059134b` · hold lockfile edits |

## Next Ready (after deps)

| ID | Status | Owner | Reviewer | Depends | When |
| --- | --- | --- | --- | --- | --- |
| RB-003 | Ready after RB-002 merge | Engineer Overlord | Backend Architect Wizard | RB-002; live sign-off needs RB-004 | Start spike now; do not claim live-ready without gate |
| RB-005 | Blocked | Backend Architect Wizard | Engineer Overlord | RB-001 | Unblocks when RB-001 review lands |
| RB-014 (skeleton) | Ready (docs only) | Mnemosyne Archivist | Product Manager Titan | — for skeleton; RB-009/010 for verified cmds | Claim README skeleton with explicit incomplete sections |

## Critical path (deterministic slice)

1. RB-002 merge → unlocks shared lockfile / preflight baseline  
2. RB-001 merge → unlocks RB-005 contracts  
3. RB-005 → unlocks RB-006 (economy) + RB-007 (verifier) + schema-valid RB-010 mocks  
4. RB-006 + RB-007 → RB-008 pipeline → RB-009 replay/export ← **checkpoint**  
5. RB-003 + RB-004 (live gate) + RB-008 → RB-011 live campaign  
6. RB-012 CI · RB-013 E2E · RB-014 reproduction

## Parking / later

| ID | Status | Owner | Reviewer |
| --- | --- | --- | --- |
| RB-006 | Backlog | Backend Architect Wizard | Engineer Overlord |
| RB-007 | Backlog | Engineer Overlord | UI Design Goblin (independent challenge) |
| RB-008 | Backlog | Engineer Overlord | Backend Architect Wizard |
| RB-009 | Backlog | Engineer Overlord | UI Design Goblin |
| RB-011 | Backlog | Engineer Overlord | Backend Architect Wizard |
| RB-012 | Backlog | Engineer Overlord | Backend Architect Wizard |
| RB-013 | Backlog | UI Design Goblin | Product Manager Titan |
| RB-014 | Ready (skeleton) / Done after RB-009+010 | Mnemosyne Archivist | Engineer Overlord |
| RB-015–017 | Backlog (P1) | per §19 | — |

## Coordination rules (enforced)

- One bounded task per owner; separate branch/worktree.  
- No concurrent lockfile/`package.json` edits — Engineer Overlord is lockfile owner.  
- Critical verification / authorization / replay: non-author review required.  
- Label live / scripted / mocked / recorded results explicitly.  
- Board updates via this file + room handoffs; do not race rewrites.

## Open blockers

| Item | Owner | Blocker |
| --- | --- | --- |
| RB-004 PR | Backend Architect Wizard / Marco | PR create from agent host may need Marco approval |
| RB-005 | Backend Architect Wizard | Waiting RB-001 review sign-off |
| RB-010 lockfile | UI Design Goblin | Waiting RB-002 merge before `npm install` / lockfile touch |
| Cloud Agents | Engineer Overlord | Unavailable on plan — local checkout path OK for now |

## Handoff template

```
Task claimed:
Immediate deliverable:
Dependency or blocker:
Acceptance check:
Reviewer:
```
