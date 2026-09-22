/**
 * Demo-freeze honesty caps for Candidate A.
 * UI is source of truth for pitch wording; keep accurate over marketing.
 */

export type CapStatus =
  | "center"
  | "done_pitch_open"
  | "not_claim"
  | "partial"
  | "not_run"
  | "hard_cap"
  | "forbid";

export type PitchCap = {
  id: string;
  title: string;
  status: CapStatus;
  pillKind: string;
  pillLabel: string;
  body: string;
};

/** Hard honesty caps — must stay visible; no greenwashing. */
export const PITCH_CAPS: readonly PitchCap[] = [
  {
    id: "offline-p0",
    title: "Offline P0 evidence path",
    status: "center",
    pillKind: "confirmed",
    pillLabel: "Demo center of gravity",
    body:
      "Scripted known failure → independent INV → store-backed confirmed only after same-target matched_violation → safety regression → three views. This is what we sell in the demo.",
  },
  {
    id: "rb011-48",
    title: "Thor dual-agent evidence (#48)",
    status: "done_pitch_open",
    pillKind: "candidate",
    pillLabel: "Done · pitch not closed",
    body:
      "Evidence bar Done on Mac Thor SSH → networked local Ollama (player-a / player-b). rb011 Done does not close the live pitch.",
  },
  {
    id: "ssh-ne-g4",
    title: "SSH ≠ G4 containment",
    status: "not_claim",
    pillKind: "blocked_as_expected",
    pillLabel: "SSH≠G4",
    body:
      "Thor SSH to a networked LLM is wiring/evidence only. It is not G4 containment, jail Pass, or a security claim.",
  },
  {
    id: "not-agenc",
    title: "Not AgenC dual sessions",
    status: "not_claim",
    pillKind: "inconclusive",
    pillLabel: "Thor SSH only",
    body:
      "Live dual-agent path is Thor SSH Ollama player-a / player-b only. Do not describe as AgenC daemon dual sessions.",
  },
  {
    id: "m13-partial",
    title: "M13 dual-agent UI enablement",
    status: "partial",
    pillKind: "scripted",
    pillLabel: "Partial-on-UI-SSH",
    body:
      "Browser enables Thor live provenance labels when capabilities allow. Browser does not run Thor SSH; CLI remains spike:thor-dual.",
  },
  {
    id: "g4-not-run",
    title: "G4-P3 / G4-P4",
    status: "not_run",
    pillKind: "inconclusive",
    pillLabel: "Not run",
    body:
      "Offline G4-P3 and G4-P4 remain Not run. No jail Pass. Do not imply containment from Thor smoke or dual-agent evidence.",
  },
  {
    id: "paid-zero",
    title: "Paid cloud spend",
    status: "hard_cap",
    pillKind: "blocked_as_expected",
    pillLabel: "paid $0",
    body:
      "Hard cap $0 on paid cloud / BYOK / ChatGPT OAuth. Live path is Thor SSH networked local Ollama only.",
  },
  {
    id: "ui-dual-50",
    title: "Dual-agent UI enablement (#50)",
    status: "done_pitch_open",
    pillKind: "candidate",
    pillLabel: "Done ≠ closed pitch",
    body:
      "Candidate A live provenance + enablement shipped (#50). Unlock is not a closed live pitch and does not promote G4 or AgenC dual sessions.",
  },
  {
    id: "no-secure",
    title: 'No "secure" badge',
    status: "forbid",
    pillKind: "blocked_as_expected",
    pillLabel: "blocked_as_expected ≠ secure",
    body:
      "Never show a green secure badge. Fixed-control blocked_as_expected is copper-outline honesty, not a security Pass.",
  },
] as const;

export const PITCH_NON_CLAIMS: readonly string[] = [
  "Closed live agent discovery / contained dual-agent pitch",
  "G4 Pass or jail Pass from Thor SSH or UI enablement",
  "AgenC dual sessions from this UI",
  "Browser-run Thor SSH",
  "Paid cloud spend or BYOK live path",
  'Treating blocked_as_expected or clean fixed runs as "secure"',
] as const;

export const PITCH_DEMO_GRAVITY =
  "Offline P0 evidence path is the demo center of gravity. Live Thor dual-agent is evidenced but pitch-not-closed.";
