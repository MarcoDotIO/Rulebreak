# Rulebreak — Task Board

Owner: Scrum Master Chronomancer  
Source: AGENTS.md §19  
Updated: 2026-09-15 ~17:40 ET (progress snap for Marco)

Columns: `Backlog → Ready → In Progress → Review → Done` (+ `Blocked` with named blocker).

## Status for humans (one glance)

**Done on main:** RB-001 PRD · RB-002 toolchain · RB-003 offline spike (live G2–G4 **not** claimed) · RB-004 threat/live gate docs · RB-005 contracts v1 · RB-006 fixed/faulty economy · RB-010 three-view UI (schema-valid mocks + MOCK banner) · RB-014 README skeleton.

**Not the demo yet:** independent verifier → scripted campaign persist → offline replay + safety regression (**RB-007 → RB-008 → RB-009**). That is the first integration checkpoint.

**Still open:** live isolation probes G2–G4 / G2–G7; full RB-014 reproduction pack after RB-009.

## Done

| ID | Owner | Reviewer | Evidence |
| --- | --- | --- | --- |
| RB-001 | Product Manager Titan | Engineer Overlord; UI Design Goblin | On main |
| RB-002 | Engineer Overlord | Backend Architect Wizard | On main |
| RB-003 (offline) | Engineer Overlord | Backend Architect Wizard | On main; live acceptance deferred |
| RB-004 | Backend Architect Wizard | Engineer Overlord | On main |
| RB-005 | Backend Architect Wizard | Engineer Overlord | On main · frozen contracts |
| RB-006 | Backend Architect Wizard | Engineer Overlord | On main · #10 |
| RB-010 (mock) | UI Design Goblin | Engineer Overlord; Product Manager Titan | On main · #11 · MOCK banner stays |
| RB-014 (skeleton) | Mnemosyne Archivist | Product Manager Titan | On main · #5 · verified cmds later |

## In Progress / Next

| ID | Status | Owner | Reviewer | Depends | Notes |
| --- | --- | --- | --- | --- | --- |
| RB-007 | Ready / claim now | Engineer Overlord | UI Design Goblin (independent challenge) | RB-005 ✅ | Critical path — do not reuse economy handlers |
| RB-008 | Ready after RB-007 | Engineer Overlord | Backend Architect Wizard | RB-006 ✅, RB-007 | Scripted known failure + persist |
| RB-009 | Ready after RB-008 | Engineer Overlord | UI Design Goblin | RB-008 | Offline replay; safety test red/green |
| RB-003 live gate | Blocked | Engineer Overlord | Backend Architect Wizard | G2–G7 probes | Offline path continues without this |
| RB-011 | Backlog | Engineer Overlord | Backend Architect Wizard | RB-003 live, RB-004, RB-008 | Out of pitch until isolation real |
| RB-012 | Backlog | Engineer Overlord | Backend Architect Wizard | RB-008 | Offline CI |
| RB-013 | Backlog | UI Design Goblin | Product Manager Titan | RB-009, RB-010, RB-011, RB-012 | E2E matrix |
| RB-014 full | Blocked | Mnemosyne Archivist | Engineer Overlord | RB-009, RB-010 | Skeleton done; exercise after replay |

## Critical path (deterministic checkpoint)

1. ~~RB-002 / RB-001 / RB-005 / RB-006~~  
2. **RB-007** verifier ← now  
3. **RB-008** pipeline  
4. **RB-009** replay/export ← checkpoint (“reproducible economy failure”)  
5. Then UI wire-up, CI, E2E, full docs; live agents only after isolation evidence

## Coordination rules

- One bounded task per owner; separate branch/worktree.  
- Engineer Overlord owns lockfile.  
- Non-author review for verification / authorization / replay.  
- Label live / scripted / mocked / recorded explicitly.  
- Need a merge Marco can’t do from a bot? DM him the PR link.

## Handoff template

```
Task claimed:
Immediate deliverable:
Dependency or blocker:
Acceptance check:
Reviewer:
```
