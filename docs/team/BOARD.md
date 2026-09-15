# Rulebreak — Task Board

Owner: Scrum Master Chronomancer  
Source: AGENTS.md §19  
Updated: 2026-09-15 ~18:05 ET (deterministic checkpoint hit)

## Status for humans

**Checkpoint achieved:** scripted known failure → independent INV check → persisted candidate finding → offline replay → safety regression (faulty red / fixed green) is on main. Three views wire to the real scripted stream (#16). This is the demo center of gravity.

**Do not sell:** live agent discovery (G2–G4 still open).

**Board pressure now:** packaging + acceptance + verified docs — not new features.

## Done on main

| ID | Notes |
| --- | --- |
| RB-001–006 | Foundations + dual economy |
| RB-003 offline | Live G2–G4 **not** claimed |
| RB-004 | Threat / live gate docs |
| RB-007 | Independent verifier · #13 |
| RB-008 | Scripted durable pipeline · #14 |
| RB-009 | Offline replay + regression export · #15 |
| RB-010 + stream wire | Schema mocks → real scripted SSE · #16 |
| RB-014 skeleton | README Verified vs Not-verified · #5 |

## Next (P0 pressure)

| ID | Status | Owner | Reviewer | Notes |
| --- | --- | --- | --- | --- |
| RB-012 | In review | Engineer Overlord | Backend Architect Wizard | Offline CI + demo packaging; no ambient secrets | branch `rb-012-offline-ci` · `npm run ci:offline` |
| RB-013 | Ready after RB-012 green (or parallel matrix draft) | UI Design Goblin | Product Manager Titan | Acceptance + negative controls; include clean-target |
| RB-014 full | Ready — walk now | Mnemosyne Archivist | Engineer Overlord | Promote replay/export cmds to **Verified** only after you run them |
| candidate→confirmed | In progress | Engineer Overlord | UI Design Goblin | Durable `applyConfirmingReplay` + API wiring; Goblin review on honesty labels |
| Live G2–G4 | Blocked | Engineer Overlord | Backend Architect Wizard | Isolation probes; keeps RB-011 out of pitch |

## Parking

| ID | Owner | When |
| --- | --- | --- |
| RB-011 | Engineer Overlord | After live isolation evidence |
| RB-015–017 | per §19 | After P0 acceptance |

## Coordination

- Prefer `gh` for PR create/merge while Marco is out (auth confirmed on host).  
- One bounded task; EO owns lockfile.  
- Label live / scripted / mocked / recorded.  
- Non-author review for verification / auth / replay.

## Handoff template

```
Task claimed:
Immediate deliverable:
Dependency or blocker:
Acceptance check:
Reviewer:
```
