# G4-P3 honesty (offline)

**Status:** G4-P3 remains **Not run** on the offline rollup (**13 / 0 / 2**).

## Why Not run (not Pass)

G3-P3 true Pass merged in #37 (`75a53c9`) used AgenC `permissionMode: "bypassPermissions"` plus unattended allow/deny lists so the offline observe turn could finish without an approve/deny race. That spike leaves `callbackLog: []` in `docs/spikes/g3-p3-ollama-artifact.json`.

G4-P3 is the **permission-callback** probe. Empty `callbackLog` under bypass mode is **not** permission proof. The offline grader (`scripts/spikes/g2-g4-offline-probes.mjs` → `gradeG4P3`) therefore:

1. Returns **Not run** when the G3-P3 artifact is missing, uses bypass, or has an empty `callbackLog`.
2. May return **Partial** only if a future offline run records real allow/deny callbacks — still **not** a G4 containment Pass.
3. **Never** upgrades G4-P3 to **Pass** from empty `callbackLog` / bypass harness.

## Spike labels ≠ G4

| Spike label | What it actually is | Not G4 for |
| --- | --- | --- |
| `alwaysLoad` (`anthropic/alwaysLoad` / eager-load) | Deferred-MCP workaround so tools load for G3-P3 | Containment / isolation |
| `bypassPermissions` + unattended allow/deny | Race harness for unattended offline spike | Permission-callback proof |

## Live gates

Supporting G3-P3 Pass does **not** close live G2–G4 or RB-011. Those remain **Blocked** until Chronomancer/Marco reopen live criteria. This note is offline honesty only — no live spend, no CI edits, no BOARD ownership fight.
