# Reproduction guide

**Status:** Offline scripted + replay path verified twice on 2026-09-15 EDT.
1. First Archivist walk (RB-009 commands).
2. **Cold second pass** (this update) following the post–RB-012 written steps, including `npm run ci:offline`.

## Host evidence

### First walk (Archivist)

| Field | Value |
| --- | --- |
| Date | 2026-09-15 18:04 EDT |
| Host | macOS 27.0 · arm64 |
| Node / npm | `26.5.0` / `11.17.0` |
| Tip | post RB-009 |
| Result | scripted-campaign 5/5 · replay-regression 3/3 |

### Cold second pass (Archivist — Chronomancer-assigned)

| Field | Value |
| --- | --- |
| Date | 2026-09-15 19:14 EDT |
| Host | macOS 27.0 · arm64 |
| Node / npm | `26.5.0` / `11.17.0` |
| Tip | `6897779` (main, post RB-012/RB-013) |
| Commands | `npm run ci:offline` → **OK**; `npm run demo:offline` → **OK** (runs same gate); `npm run replay` → stub as documented |
| Suite inside gate | 48 pass / 5 todo (includes scripted + replay integration) |

Note: same agent as the first walk; Chronomancer assigned this cold follow of the **updated** guide. A different teammate cold pass remains welcome.

## A. Fresh toolchain / offline gate

```bash
nvm use                 # .node-version → 26.5.0
npm ci                  # fresh checkout
npm run ci:offline      # Verified OK — cold pass 2026-09-15 19:14 EDT
```

Or packaging alias (also Verified on cold pass):

```bash
npm run demo:offline    # runs ci:offline, then prints vertical-slice pointers
```

Gate docs: [`docs/ci-offline.md`](ci-offline.md).

Step-by-step (still valid; covered inside the gate):

```bash
npm run preflight
npm run typecheck
npm test
npm run typecheck -w @rulebreak/web
npm run build:web
```

## B. Scripted known-failure campaign (RB-008)

```bash
npm test -- tests/integration/scripted-campaign.test.ts
```

Covered inside `ci:offline` on cold pass (**5/5** in full suite). Faulty path → `violation_candidate` with `status: candidate` + `mode: scripted`; fixed path stores no finding.

## C. Offline replay + safety export (RB-009)

```bash
npm test -- tests/integration/replay-regression.test.ts
```

Covered inside `ci:offline` on cold pass (**3/3**). Outcomes: `matched_violation` / `blocked_as_expected` / export bundle present. Notes: [`docs/replay.md`](replay.md).

## D. What is still stubbed or gated

| Operator script | Reality (cold-pass checked) |
| --- | --- |
| `npm run demo:offline` | **Verified packaging entry** — runs full `ci:offline`, then prints pointers (not a UI-driven demo) |
| `npm run replay` | Still `not-implemented` stub — use section C / full `npm test` |
| `npm run demo:live` | Not for P0 pitch — live G2–G4 open |

## E. Independent checklist

- [x] Archivist first walk (RB-009 commands) recorded
- [x] Cold second pass of updated guide (incl. `ci:offline` + `demo:offline`) — 2026-09-15 19:14 EDT
- [ ] Optional: different teammate follows A–C cold and files failures
- [x] Document durable `candidate`→`confirmed` — Verified 2026-09-15 19:35 EDT
- [x] Document G2-P3 + shared-cwd caveat — Verified offline 2026-09-15 19:55 EDT
- [ ] Operator CLI for `npm run replay` (dedicated entry, not only vitest)

## F. Store-backed confirmation (#23)

```bash
npm test -- tests/integration/confirm-promotion.test.ts
```

**Verified** (Archivist, 2026-09-15 19:35 EDT, tip `83f0b19`): **3 passed**.

| Case | Result |
| --- | --- |
| Fixed-target `blocked_as_expected` alone | Finding stays `candidate` |
| Same-target (faulty) `matched_violation` via `applyConfirmingReplay` | Durable `confirmed` |
| Second apply after confirmed | No-op (stays `confirmed`) |

Details: [`docs/replay.md`](replay.md) § Confirmation promotion. API start path also runs confirming replay when a candidate exists.

## G. G2-P3 dual AgenC sessions (#32)

```bash
npm run spike:g2-p3
# or full harness: npm run spike:g2g4
```

**Verified** offline (Archivist, 2026-09-15 19:55 EDT, tip `de6da8f`): **Pass** — distinct session IDs, homes, and daemon sockets for `player-a` / `player-b` via `spawnAgent`+`attach` (Ollama `llama3.2`, no prompt turn / no paid spend).

| Claim | Status |
| --- | --- |
| Separate `AGENC_HOME` + distinct daemon sockets | **Verified** |
| Two session IDs | **Verified** |
| Filesystem isolation / separate cwd | **Not verified** — shared repo `cwd` (Wizard caveat) |
| Live discovery / RB-011 close | **Not verified** |

See [`docs/spikes/g2-p3-session-artifact.json`](spikes/g2-p3-session-artifact.json) and plan [`docs/security/g2-g4-isolation-probe-plan.md`](security/g2-g4-isolation-probe-plan.md).

## Open questions

- Whether operator-facing replay should require lockfile hash as well as harness pin (today: matching checkout + harness packages)
