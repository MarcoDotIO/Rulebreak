# Rulebreak

Adversarial agents for testing game-economy rule violations — find reproducible failures before players do.

**Audience:** developers integrating or operating the tool, and anyone reproducing a saved finding offline.

**Charter:** [`AGENTS.md`](AGENTS.md) is the project constitution. When code, docs, and acceptance criteria disagree, stop and resolve with the owning agent before changing the contract.

## Document status

| Section | Status | Evidence |
| --- | --- | --- |
| Mission / first milestone | Draft from charter | AGENTS.md §1–3 |
| Prerequisites / offline bootstrap | **Verified** (RB-002) | `docs/compatibility.md`; re-checked 2026-09-15 EDT |
| Scripted campaign + offline replay/export | **Verified** (RB-008/RB-009) | Archivist walk below; `docs/reproduction.md` |
| Live / AgenC campaigns | **Not verified** for P0 pitch | Offline spike exists; live G2–G4 open |
| UI against live agents | **Not verified** | Scripted stream wired; live discovery out of pitch |
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
npm run ci:offline   # RB-012 local offline gate (preflight + typecheck + tests + web build)
```

Details: [`docs/ci-offline.md`](docs/ci-offline.md).

Copy `.env.example` → `.env` for local overrides. Keep `RULEBREAK_LIVE_ENABLED=false` until spend is explicitly approved.

Compatibility record: [`docs/compatibility.md`](docs/compatibility.md) (merged with RB-002).

## Offline vertical slice — Verified (RB-008 / RB-009)

Walked independently by Mnemosyne Archivist on 2026-09-15 EDT (Node `26.5.0` / npm `11.17.0`, macOS arm64).

```bash
npm run preflight          # OK — offline
npm run typecheck          # OK
npm test -- tests/integration/scripted-campaign.test.ts
# → 5 passed (faulty candidate + fixed clean + dedupe/stop)
npm test -- tests/integration/replay-regression.test.ts
# → 3 passed (matched_violation / blocked_as_expected / export bundle)
```

Details: [`docs/replay.md`](docs/replay.md), [`docs/reproduction.md`](docs/reproduction.md), [`docs/demo.md`](docs/demo.md).

**Honest labels**

- Findings from the scripted path remain `status: candidate` + `mode: scripted` until durable `candidate`→`confirmed` store promotion lands; replay returns `matched_violation` / `blocked_as_expected` separately.
- `npm run demo:offline` only prints a pointer to the scripted test (exit 0) — **not** a full operator demo CLI.
- `npm run replay` is still a **stub** (`not-implemented`). Use the integration test command above until a CLI exists.

## Planned commands — Not verified

| Command | Intent | Status |
| --- | --- | --- |
| `npm run demo:offline` | Operator demo entry | Pointer stub only — use scripted integration test |
| `npm run replay` | CLI replay of a saved finding | Stub — use replay-regression integration test |
| `npm run demo:live` | Live AgenC campaign (paid) | Blocked — G2–G4 + spend approval |
| `npm run test:e2e` | End-to-end acceptance | RB-013 |
| `npm run test:security` | Isolation / actor-boundary suite | Live probes open |
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
| [`docs/demo.md`](docs/demo.md) | Mnemosyne Archivist | **Verified beats** via integration tests (CLI stubs remain) |
| [`docs/reproduction.md`](docs/reproduction.md) | Mnemosyne Archivist | **Verified** Archivist walk 2026-09-15; second cold pass open |
| [`docs/replay.md`](docs/replay.md) | Engineer Overlord | RB-009 behavior + non-claims |
| [`docs/evaluation.md`](docs/evaluation.md) | Mnemosyne Archivist | **Incomplete** — measured results only |

## Incomplete / open questions

- [x] Offline scripted + replay/export walk recorded (`docs/reproduction.md`) — Archivist, 2026-09-15
- [x] Four-minute demo beats mapped to **Verified** commands (`docs/demo.md`)
- [ ] Non-author (second agent) follows `docs/reproduction.md` cold and files failures
- [ ] Durable `candidate`→`confirmed` promotion documented after the store write lands
- [ ] Operator CLI for `npm run replay` / real `demo:offline` (not pointer stubs)
- [ ] Evaluation table with unsuccessful and inconclusive runs preserved
- [ ] Obsidian vault sync with this repo

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
