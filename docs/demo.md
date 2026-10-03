# Demo script (four minutes)

**Status:** Beats map to **Verified** offline gate + integration coverage (Archivist cold pass 2026-09-15 19:14 EDT).  
**Packaging:** `npm run demo:offline` runs `ci:offline` then prints pointers — Verified as a gate entry, not as a UI walkthrough.

## Goal

Show a developer: known trade failure → independent detection → offline replay → regression that fails on faulty / passes on fixed — all **scripted**, no model.

## Script

| Minute | Beat | Verified command / artifact | Mode label |
| --- | --- | --- | --- |
| 0:00–0:40 | Problem: unique-item / trade lifecycle can break without a unit-test-shaped signal | Pitch from `docs/product.md` | — |
| 0:40–1:30 | Prove offline packaging / toolchain | `npm run demo:offline` or `npm run ci:offline` (**Verified**) | Offline gate |
| 1:30–2:20 | Scripted failure → **candidate** finding | `tests/integration/scripted-campaign.test.ts` | Scripted · `candidate` |
| 2:20–3:00 | Same-target replay → durable **confirmed** | `tests/integration/confirm-promotion.test.ts` (**Verified** 3/3) | Store-backed `confirmed` |
| 3:00–3:30 | Fixed control does **not** promote / not “secure” | Same suite: stays `candidate` on fixed-only | `blocked_as_expected` |
| 3:30–4:00 | Safety export + legitimate trade | `tests/integration/replay-regression.test.ts` | Faulty red / fixed green |

## Commands to rehearse

```bash
nvm use 26.5.0          # matches .node-version (the repo has no .nvmrc)
npm ci                  # fresh checkout
npm run ci:offline      # or: npm run demo:offline
```

During `npm ci`, npm may print `npm warn allow-scripts` lines saying install scripts are not yet covered by allowScripts for 2 packages (3 on macOS): `@tetsuo-ai/agenc`, `esbuild`, and on macOS `fsevents`. That skipped-postinstall warning is expected.

Optional UI (local only; not part of the offline gate claim):

```bash
RULEBREAK_OPERATOR_TOKEN=local-dev-operator npm run dev:server   # control API :4100
RULEBREAK_OPERATOR_TOKEN=local-dev-operator npm run dev:web      # UI :5173 proxies /api
```

`local-dev-operator` is the example local value from `.env.example`, not a secret. Set it inline on these two commands only; do not `export` it, because `ci:offline` fails when `RULEBREAK_OPERATOR_TOKEN` is set in the environment ([`docs/ci-offline.md`](ci-offline.md)).

If a start or stop is refused over the token, the UI names the case. A 503 (`operator_token_unset`) means `dev:server` was started without the token, and the screen shows "The local server has no operator token set. Restart dev:server and dev:web with RULEBREAK_OPERATOR_TOKEN set; see docs/demo.md." A 401 (`operator_token_invalid`) means `dev:web` was started without the token or with a different value than `dev:server`, and the screen shows "The operator token was missing or didn't match the server's. Restart dev:web with the same RULEBREAK_OPERATOR_TOKEN as dev:server; see docs/demo.md." Either way, restart with the same token on both commands: `RULEBREAK_OPERATOR_TOKEN` set inline on each, never exported. Any other failure still reads "Request failed (HTTP n); no campaign status was returned."

The fixed-target beat (3:00–3:30) is test-only: the UI offers only the faulty fixture.

## Pitch limitations (UI)

Operator freeze sheet in the Candidate A web app: primary nav → **Pitch limitations**. It lists the hard honesty caps (offline P0 is the center of gravity; #48 Done but pitch not closed; SSH≠G4; not AgenC dual sessions; M13 Partial-on-UI-SSH; G4-P3/P4 Not run; paid $0; #50 Done but pitch not closed; no "secure" badge). Copy lives in `apps/web/src/views/pitchCaps.ts`; see `docs/ui/pitch-limitations.md`.

## Benchmarks and reduction

Offline, $0: no LLM, network or Thor calls. Run each from the repo root after `npm ci`; each exits 0, prints a results table and an "Honesty caps:" list, and writes its output under `artifacts/` (gitignored). In every command `llm_single` and `llm_dual` print `not_run`: no result, not a zero. Full evidence and caps: [`docs/evaluation.md`](evaluation.md).

`npm run bench:rb015`: the RB-015 v2 trade baseline; `scripted_known` and `seeded_random` confirm INV-003 on the faulty trade fixture. Look for:

> scripted_known was written to hit this exact defect, so its faulty-target rate is expected by construction.
>
> llm_single and llm_dual are not_run (live gate not approved); they are not zero-finding results.

`npm run bench:rb016`: the RB-016 reward pair; only `scripted_known` runs, and it confirms INV-006 by construction. Look for:

> Result: scripted run confirmed INV-006, by construction.
>
> seeded_random, llm_single and llm_dual are not_run: no explorer has a reward_claim tool (RB-018, parked). They are not zero-finding results and have no metrics.

`npm run bench:rb018`: the RB-018 reward pair with the `seeded_random` `reward_claim` action. Look for these two phrases in the summary lines:

> INV-006 confirmed on all 5 independent seeds
>
> llm_single and llm_dual: not_run, no result.

`npm run reduce:rb017`: bounded reduction of the 5 confirmed `seeded_random` traces from RB-018 (it reads the committed report in `docs/spikes/`, so it does not need `bench:rb018` first). Look for:

> reduced to 2 actions, the shortest reduction found here
>
> Each reduced length is the shortest reduction found here: the reducer stops once no single remaining action can be removed, so it is not a property of the defect (not claimed to be minimal).

## Non-claims

- Say **confirmed** only when the store wrote it after same-target `matched_violation` — never from UI chrome alone.
- Fixed-control `blocked_as_expected` is not “secure” and does not promote.
- Do **not** pitch live discovery / RB-011 as closed. G2-P3 is offline session honesty only (shared cwd). Ollama on this Mac is OK for evidenced offline probes — not paid BYOK / ChatGPT OAuth.
- `npm run replay` CLI is still a stub — use the integration suite / full `npm test`.
- Exported `regression.test.ts` requires the matching Rulebreak harness packages (`docs/replay.md`).
