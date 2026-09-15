# Reproduction guide

**Status:** Incomplete — RB-014. Sections marked TODO must not be published as working steps.

## A. Fresh checkout (toolchain)

**Expected after RB-002 merges:**

```bash
nvm use   # Node 26.5.x
npm ci
npm run preflight
npm run typecheck
npm test
```

**Incomplete:** confirm these pass on a machine that did not participate in the original bootstrap, and record host/OS here.

## B. Saved-finding offline replay

**Planned once RB-009 lands:**

1. Obtain an evidence bundle (`finding.json`, `trace.json`, `initial-state.json`, harness pin).
2. Run the documented replay command (**not verified** — currently `npm run replay` is a stub).
3. Expect `confirmed` on the vulnerable target version recorded in the bundle.
4. Run the fixed-target comparison; describe success as “not reproduced on target version X,” not “all exploits are fixed.”

## C. Independent checklist

- [ ] Non-author followed section A successfully
- [ ] Non-author followed section B on a real export
- [ ] Failures filed against the owning agent (not papered over in docs)

## Open questions

- Exact export directory layout (await RB-009)
- Whether replay requires matching Rulebreak commit hash only, or also lockfile hash
