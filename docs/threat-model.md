# Threat model — Rulebreak V0

**Document status:** RB-004 policy. Distinguishes required controls from verified containment.
**Owner:** Backend Architect Wizard  
**Reviewer:** Engineer Overlord  
**Live gate:** This document plus `docs/security/live-acceptance-gate.md` must be satisfied before live RB-003 / RB-011 acceptance.

## 1. Scope

Authorized adversarial testing of an **owned synthetic trade economy**. V0 rejects arbitrary external target URLs, production game accounts, real assets, payment credentials, wallets, and transfers.

Untrusted inputs include: runtime model output, strategy notes, game descriptions, imported traces, and target responses. None may alter tool permissions, approved targets, actor bindings, budgets, or the rule pack.

## 2. Actors and trust

| Actor | Trust | May do | Must not do |
| --- | --- | --- | --- |
| Operator (human / local UI) | Trusted with local token | Create/stop campaigns, view findings, export allowlisted artifacts, start replays | Bundle long-lived secrets into the browser, expose management APIs without origin/token checks |
| Campaign coordinator | Trusted process | Bind actors, admit actions, freeze violating traces, drive scripted or live explorers | Trust model text for permissions; share verifier snapshots with explorers |
| Trade Explorer (Player A) | Untrusted model | Use Player-A-scoped domain MCP tools only | Reset target, pick fixture mode, read evidence DB, call operator APIs, spoof actor/campaign |
| Counterparty Explorer (Player B) | Untrusted model | Use Player-B-scoped domain MCP tools only | Same as Explorer A |
| Target adapter | Semi-trusted fixture code | Mutate synthetic world via `execute` | Provide correctness oracle to verifier; expose private fixture labels to explorers |
| Independent verifier | Trusted, separate code | Evaluate approved invariants on snapshots | Call target “fixed” handlers as oracle; share mutation logic with target |
| Evidence store | Trusted local files | Persist actions, violations, exports under campaign dirs | Accept path traversal; mount into worker sandbox |

## 3. Assets

- Provider API keys and operator tokens
- Evidence bundles and finding exports
- Rule pack and fixture mode (faulty vs fixed)
- Actor capability bindings per campaign
- Host filesystem (source checkout, Docker socket, SSH agent, home mounts)

## 4. Threats and mitigations

| ID | Threat | Mitigation (required) | Verified in V0? |
| --- | --- | --- | --- |
| T-01 | Explorer supplies `actorId` / `campaignId` / capability token | Bridge derives identity from trusted binding; reject authority fields in schemas | Policy encoded; runtime in RB-003 |
| T-02 | Explorer uses shell, arbitrary FS, browser, install, daemon control | Deny those tools; test effective permissions, not prompt text alone | Policy encoded; runtime in RB-003 |
| T-03 | Cross-campaign read or action after stop | Bind capabilities to one campaign; revoke on stop; negative tests | Policy encoded; runtime with pipeline |
| T-04 | Secret leakage in logs, UI, exports | Redact; no secrets in `.env.example`; no query-string tokens; no keys in `apps/web` | Partial (example env); export redaction TBD |
| T-05 | Faulty fixture selected or leaked to explorers | Explicit fixture mark; inaccessible from public interfaces; default is fixed | Policy encoded; economy in RB-006 |
| T-06 | Verifier shares mutation code with target | Separate packages; independent predicates; dual review | Enforced by ownership + RB-007 review |
| T-07 | Live spend without approval / incomplete config | `RULEBREAK_LIVE_ENABLED` default false; preflight refuses incomplete live config | Preflight exists (RB-002) |
| T-08 | Path traversal on export | Allowlist artifact files under campaign directory | Runtime with RB-009 |
| T-09 | Prompt injection via observations / strategy notes | Treat as data; notes never execute; permissions immutable | Prompt + permission callback + tests |
| T-10 | Broad sandbox bypass to “unblock” demo | Forbidden; document reduced offline demo instead | Process gate (this doc) |

## 5. Explorer tool allowlist (P0)

Allowed MCP tools only: `economy_observe`, `trade_create`, `trade_accept`, `trade_cancel`, `strategy_note`.  
P1 later: `reward_claim`.  

Denied (non-exhaustive): general shell, arbitrary file read/write, browser/network tools, package install, dynamic plugins/hooks, daemon control, operator HTTP routes, target reset/dispose, verifier snapshot, fixture selection.

Machine-readable copy: `packages/security-policy`.

## 6. Isolation baseline for live workers

Required for live acceptance (not claimed until demonstrated):

1. Dedicated non-root runtime with **no** host source checkout, Docker socket, SSH agent, home-directory mount, or evidence-database mount.
2. Worker egress restricted to approved provider + internal bridge routes.
3. Target and verifier need **no** public internet.
4. Two explorers are separate bound contexts; neither sees the other's private observations or capabilities.
5. Effective permission probes deny the forbidden tool classes above.

If hard OS containment is not demonstrated, document the limitation and keep the demo offline/scripted. Do not claim sandbox guarantees.

## 7. Target vs verifier separation

- Target owns mutation (`initialize` / `execute` / dispose for coordinator only).
- Verifier owns independent predicates over snapshots and the approved rule pack.
- Explorers never call `initialize`, `dispose`, `snapshotForVerifier`, or fixture selectors.
- Development agents may know the seeded bug; runtime explorers must not receive fixture source, private mode labels, solution traces, or expected failing steps.

## 8. Review and blocking authority

Backend Architect Wizard owns this threat model and security review of capability / authentication / execution changes. Engineer Overlord or Backend Architect Wizard may block live release for an unproven required boundary. The author of an execution-boundary change cannot be its sole reviewer.
