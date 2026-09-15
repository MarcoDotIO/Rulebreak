# Live acceptance gate (RB-003 / RB-011)

**Purpose:** Block live spend and live multi-agent campaigns until required boundaries are evidenced.  
**Owner:** Backend Architect Wizard  
**Integration owner:** Engineer Overlord  

Offline scripted work may proceed without this gate. **Live mode must not**.

## Hard prerequisites

| # | Requirement | Evidence expected | Status owner |
| --- | --- | --- | --- |
| G1 | Node/npm pins + offline preflight | `npm ci` + `npm run preflight` on pinned toolchain | Engineer Overlord (RB-002) — **signed off 2026-09-15** |
| G2 | Two bound explorer contexts with distinct actor bindings | Spike log: createSession ×2, distinct bindings | Engineer Overlord (RB-003) |
| G3 | Real domain tool round-trip under binding | Tool call succeeds for bound actor only | Engineer Overlord (RB-003) |
| G4 | Denied-operation checks (shell/FS/daemon/operator tools) | Automated negative tests showing denial | Engineer Overlord + Backend Architect Wizard |
| G5 | Actor authority fields rejected | Schema/bridge tests for spoofed `actorId` / `campaignId` | Backend Architect Wizard |
| G6 | Live config incomplete → refuse | Preflight + runtime refuse when live true without model/token | Engineer Overlord (exists in RB-002 preflight) |
| G7 | No broad sandbox bypass flags | Code review; no undocumented escape hatches | Backend Architect Wizard |
| G8 | Fixture mode inaccessible to explorers | Negative test | Backend Architect Wizard (RB-006) |
| G9 | Threat model reviewed | This repo's `docs/threat-model.md` + PR review | Backend Architect Wizard / Engineer Overlord |

## Explicit non-claims until proven

- OS-level containment (no source mount, no Docker socket, egress restrict) is **not** claimed by RB-004 documentation alone.
- Prompt wording and SDK permission callbacks alone are **insufficient** evidence for G4.

## Reduced path when blocked

If G2–G4 fail, ship the deterministic scripted vertical slice (RB-006→RB-009) and document isolation as unverified. Do not enable paid execution to bypass the gate.
