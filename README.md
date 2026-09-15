# Rulebreak

Adversarial agents for testing game-economy rule violations — find reproducible failures before players do.

**Audience:** developers integrating or operating the tool, and anyone reproducing a saved finding offline.

**Charter:** [`AGENTS.md`](AGENTS.md) is the project constitution. When code, docs, and acceptance criteria disagree, stop and resolve with the owning agent before changing the contract.

## Document status

| Section | Status | Evidence |
| --- | --- | --- |
| Mission / first milestone | Draft from charter | AGENTS.md §1–3 |
| Prerequisites / offline bootstrap | **Verified on RB-002** (merged PR [#1](https://github.com/MarcoDotIO/Rulebreak/pull/1)) | `docs/compatibility.md` on that branch |
| Live / AgenC campaigns | **Not verified** | RB-003 + RB-004 gate |
| Demo script / finding reproduction | **Incomplete** | RB-014 after RB-009/RB-010 |
| Evaluation results | **Incomplete** | awaits measured runs |

**Rule:** only commands marked **Verified** below have been run successfully on a recorded host. Everything else is planned or stubbed — do not treat stubs as working software.

## First milestone (P0)

The smallest complete system that can:

1. Execute a **known** trade-failure sequence against the synthetic economy.
2. Detect the violated economic rule with **independent deterministic** code.
3. Preserve evidence and **reproduce the failure offline**.
4. Export a safety regression that **fails on the faulty target**, **passes on the fixed target**, while legitimate trading still works.

Start with a labeled **scripted** driver. Real AgenC explorers come after the deterministic path and spend/isolation gates are in place.

## Prerequisites

| Requirement | Pin | Notes |
| --- | --- | --- |
| Node | `26.5.0` (range `>=26.5.0 <27.0.0`) | See `.node-version` |
| npm | `>=11.17.0` | Workspaces + committed lockfile |
| OS (current team host) | macOS (Apple Silicon) | Cross-platform support is **unclaimed** until CI proves it |

With nvm on the team Mac:

```bash
nvm install 26.5.0
nvm use
```

## Offline bootstrap — Verified (RB-002)

These commands passed on Node `26.5.0` / npm `11.17.0` (2026-09-15). Wrong Node/npm fails intentionally.

```bash
git clone https://github.com/MarcoDotIO/Rulebreak.git
cd Rulebreak
npm ci
npm run preflight
npm run typecheck
npm test
```

Copy `.env.example` → `.env` for local overrides. Keep `RULEBREAK_LIVE_ENABLED=false` until spend is explicitly approved.

Compatibility record: [`docs/compatibility.md`](docs/compatibility.md) (merged with RB-002).

## Planned commands — Not verified

These scripts exist as placeholders or are not on `main` yet. Running them today is expected to fail or no-op.

| Command | Intent | Unblocks when |
| --- | --- | --- |
| `npm run demo:offline` | Scripted trade-failure demo | RB-008 / RB-009 |
| `npm run demo:live` | Live AgenC campaign (paid) | RB-003 + RB-004 + approval |
| `npm run replay` | Offline replay of a saved finding | RB-009 |
| `npm run test:e2e` | End-to-end acceptance | RB-013 |
| `npm run test:security` | Isolation / actor-boundary suite | RB-004 runtime probes |
| `npm run benchmark -- --mode offline` | Non-model baselines | P1 evaluation |

## Operator modes (label every result)

| Mode | Meaning |
| --- | --- |
| Scripted fixture | Deterministic known-failure path |
| Live agents | Model-driven exploration (budgets + spend gate) |
| Recorded replay | Reproducing a saved finding without a model |
| Mocked UI | Frontend against schema-shaped fakes — not production evidence |

Never treat a bounded clean run as proof the target is safe.

## Docs map

| Doc | Owner | Status |
| --- | --- | --- |
| [`AGENTS.md`](AGENTS.md) | Team charter | Source of truth |
| [`docs/product.md`](docs/product.md) | Product Manager Titan | Merged (RB-001 / PR #3) |
| [`docs/compatibility.md`](docs/compatibility.md) | Engineer Overlord | Merged (RB-002 / PR #1) |
| [`docs/threat-model.md`](docs/threat-model.md) | Backend Architect Wizard | Merged (RB-004 / PR #6) |
| [`docs/team/BOARD.md`](docs/team/BOARD.md) | Scrum Master Chronomancer | Merged (PR #4) |
| [`docs/ui/three-view-spec.md`](docs/ui/three-view-spec.md) | UI Design Goblin | In review (RB-010 / PR #2) |
| [`docs/demo.md`](docs/demo.md) | Mnemosyne Archivist | **Incomplete** — four-minute demo script |
| [`docs/reproduction.md`](docs/reproduction.md) | Mnemosyne Archivist | **Incomplete** — fresh-checkout + saved-finding walkthrough |
| [`docs/evaluation.md`](docs/evaluation.md) | Mnemosyne Archivist | **Incomplete** — measured results only |

## Incomplete / open questions

Tracked for RB-014 (full reproduction pack). Skeleton accepts gaps; do not invent answers.

- [ ] Four-minute demo script against a **real** exported finding (`docs/demo.md`)
- [ ] Fresh-checkout reproduction guide exercised by a non-author (`docs/reproduction.md`)
- [ ] Finding-bundle README template (rule, observation, reproduction, impact, limitations)
- [ ] Glossary published for operators (candidate / confirmed / not_reproduced / inconclusive)
- [ ] Evaluation table with unsuccessful and inconclusive runs preserved
- [ ] Obsidian vault sync with this repo (deferred until first docs milestone lands)

Open setup questions become GitHub issues — never filled with guesses.

## Review and ownership

| Concern | Owner | Independent check |
| --- | --- | --- |
| Verifier / replay / CI | Engineer Overlord | UI Design Goblin challenges evidence |
| Domain contracts / isolation | Backend Architect Wizard | Engineer Overlord reviews |
| Product scope / AC | Product Manager Titan | Engineer Overlord + UI Design Goblin |
| Setup & reproduction docs | **Mnemosyne Archivist** | Another team member must succeed following the guide |

Documentation review does **not** replace technical verification or security approval.

## License / safety

Synthetic economy only in V0. Live spend, external backends, and publication require explicit human approval. Do not weaken isolation to bypass a blocker.
