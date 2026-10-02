/**
 * Demo-freeze honesty caps for Candidate A (forensic ledger).
 * Accuracy over marketing: every line here must be defensible from main.
 * Freeze basis: main @ a1367e2 (includes #48, #50, #51).
 */

/**
 * StatusPill kinds used on this page (StatusPill.module.css classes).
 * `neutral` marks page emphasis without borrowing a finding status. The
 * `cap_*` kinds are pitch-cap states with their own dashed or dotted outline,
 * so no pitch pill borrows a finding status (`candidate`, `confirmed`,
 * `not_reproduced`, `inconclusive`) and none reads as a store-backed finding.
 */
export type PitchPillKind =
  | "neutral"
  | "blocked_as_expected"
  | "cap_not_closed"
  | "cap_partial"
  | "cap_not_run"
  | "cap_not_claim";

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
  pillKind: PitchPillKind;
  pillLabel: string;
  body: string;
};

export type PitchChip = { kind: PitchPillKind; label: string };

/**
 * The pill kind and status text each open cap must show. A cap with one of
 * these statuses uses that kind, and its pill label contains that text.
 */
export const CAP_STATUS_PILL = {
  done_pitch_open: { kind: "cap_not_closed", text: "not closed" },
  partial: { kind: "cap_partial", text: "Partial" },
  not_run: { kind: "cap_not_run", text: "Not run" },
} as const satisfies Partial<Record<CapStatus, { kind: PitchPillKind; text: string }>>;

/** Shared "pitch not closed" chip (pitch page and the live-agents row in setup). */
export const PITCH_NOT_CLOSED_CHIP: PitchChip = {
  kind: "cap_not_closed",
  label: "pitch not closed",
};

/** Summary chips at the top of the page (same order as rendered). */
export const PITCH_CHIPS: readonly PitchChip[] = [
  { kind: "neutral", label: "Offline P0 = demo center" },
  PITCH_NOT_CLOSED_CHIP,
  { kind: "blocked_as_expected", label: "SSH≠G4" },
  { kind: "cap_not_claim", label: "not AgenC dual sessions" },
  { kind: "cap_partial", label: "M13 Partial-on-UI-SSH" },
  { kind: "cap_not_run", label: "G4-P3/P4 Not run" },
  { kind: "blocked_as_expected", label: "paid $0" },
  { kind: "blocked_as_expected", label: "blocked_as_expected ≠ secure" },
] as const;

export const PITCH_FREEZE_BASIS = "main @ a1367e2 (#48, #50, #51)";

export const PITCH_DEMO_GRAVITY =
  "The offline P0 evidence path is the demo's center of gravity. Thor dual-agent evidence exists, but the pitch is not closed.";

/** Hard honesty caps. They must stay visible, and none of them is a security Pass. */
export const PITCH_CAPS: readonly PitchCap[] = [
  {
    id: "offline-p0",
    title: "Offline P0 evidence path",
    status: "center",
    pillKind: "neutral",
    pillLabel: "Demo center of gravity",
    body:
      "Scripted known trade failure → independent detection → candidate → store-backed confirmed only after same-target matched_violation → fixed control stays candidate → safety regression export. Rehearse with `npm run ci:offline`. Lead the demo with this.",
  },
  {
    id: "rb011-48",
    title: "Thor dual-agent evidence (#48)",
    status: "done_pitch_open",
    pillKind: "cap_not_closed",
    pillLabel: "Done · pitch not closed",
    body:
      "Evidence Done (#48): from the Mac, player-a and player-b each ran one Ollama `/api/generate` turn on Thor over SSH. That is runtime evidence, not a closed live-discovery pitch.",
  },
  {
    id: "ssh-ne-g4",
    title: "SSH ≠ G4 containment",
    status: "not_claim",
    pillKind: "blocked_as_expected",
    pillLabel: "SSH≠G4",
    body:
      "SSH to a networked local LLM is transport and evidence only. It is not G4 containment, not a jail Pass, and not a security claim.",
  },
  {
    id: "not-agenc",
    title: "Not AgenC dual sessions",
    status: "not_claim",
    pillKind: "cap_not_claim",
    pillLabel: "Thor SSH Ollama only",
    body:
      "The live dual-agent path is Thor SSH Ollama player-a / player-b only. Do not describe it as AgenC dual sessions or AgenC daemon agents.",
  },
  {
    id: "m13-partial",
    title: "M13 dual-agent UI",
    status: "partial",
    pillKind: "cap_partial",
    pillLabel: "Partial-on-UI-SSH",
    body:
      "The UI can switch provenance to live Thor labels when `/api/health` allows it. The browser does not run Thor SSH; the CLI does (`npm run spike:thor-dual`). Campaigns started from the control API stay scripted.",
  },
  {
    id: "g4-not-run",
    title: "G4-P3 / G4-P4",
    status: "not_run",
    pillKind: "cap_not_run",
    pillLabel: "Not run",
    body:
      "G4-P3 and G4-P4 remain Not run, so there is no jail Pass. Do not imply containment from the Thor smoke test or the dual-agent evidence.",
  },
  {
    id: "paid-zero",
    title: "Paid cloud spend",
    status: "hard_cap",
    pillKind: "blocked_as_expected",
    pillLabel: "paid $0",
    body:
      "Hard cap: $0 on paid cloud, BYOK, and ChatGPT OAuth. The only live model path is Thor SSH to networked local Ollama.",
  },
  {
    id: "ui-dual-50",
    title: "Dual-agent UI enablement (#50)",
    status: "done_pitch_open",
    pillKind: "cap_not_closed",
    pillLabel: "Done · pitch not closed",
    body:
      "UI-DUAL is Done (#50): live provenance labels and the enable control shipped on Candidate A. That does not close the live pitch, and it does not promote G4 or AgenC dual sessions.",
  },
  {
    id: "no-secure",
    title: 'No "secure" badge',
    status: "forbid",
    pillKind: "blocked_as_expected",
    pillLabel: "blocked_as_expected ≠ secure",
    body:
      "The UI has no secure badge and no green pass state. A fixed-control blocked_as_expected result is a copper-outline honesty chip, not a security Pass.",
  },
] as const;

/** What an operator can say out loud during the demo freeze. */
export const PITCH_CAN_SAY: readonly string[] = [
  "Offline: a scripted known failure is detected independently and is only marked confirmed by the store after a same-target matched_violation replay.",
  "The fixed target does not promote. It stays candidate / blocked_as_expected, which is not the same as secure.",
  "Thor dual-agent evidence exists (#48): player-a and player-b each ran one Ollama turn over SSH. Paid cloud spend was $0.",
  "The UI shows live Thor provenance labels when capabilities allow (#50). The browser itself never opens SSH.",
] as const;

export const PITCH_NON_CLAIMS: readonly string[] = [
  "A closed live agent-discovery pitch, or a contained dual-agent pitch",
  "A G4 Pass or jail Pass from Thor SSH, #48 evidence, or #50 UI enablement",
  "AgenC dual sessions (the live path is Thor SSH Ollama player-a / player-b)",
  "The browser running Thor SSH (the CLI does: `spike:thor-dual`)",
  "Paid cloud, BYOK, or ChatGPT OAuth live paths",
  'Treating blocked_as_expected or a clean fixed run as "secure"',
] as const;
