# Pitch limitations page (Candidate A)

**Status:** Demo-freeze view in the forensic-ledger UI
**Nav:** AppShell primary nav → **Pitch limitations** (`ViewId` `pitch`; static, no API call)
**Copy source:** `apps/web/src/views/pitchCaps.ts` (rendered by `PitchLimitations.tsx`; guarded by `pitchCaps.test.ts`)
**Freeze basis:** main @ `a1367e2` (#48, #50, #51)

This page records what we can honestly sell now:

- The offline P0 evidence path is the demo's center of gravity.
- Thor dual-agent evidence is Done (#48), but the pitch is not closed.
- SSH ≠ G4 containment.
- Not AgenC dual sessions: Thor SSH Ollama `player-a` / `player-b` only.
- M13 is Partial-on-UI-SSH: the browser does not run Thor SSH (the CLI does, via `spike:thor-dual`).
- G4-P3 / G4-P4 remain Not run, so there is no jail Pass.
- Paid cloud hard cap is $0.
- Dual-agent UI enablement (#50) is not a closed live pitch.
- No "secure" badge; `blocked_as_expected` is never shown as secure.

Edit wording in `pitchCaps.ts` first, then keep this list in sync.
