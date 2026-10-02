import styles from "./StatusPill.module.css";

/**
 * Every pill kind, one per class in StatusPill.module.css (besides `.pill`).
 * Typed so a misspelled kind, or a finding kind where a pitch kind belongs,
 * fails `tsc`. pitchCaps.test.ts checks this list matches the CSS.
 */
export const PILL_KINDS = [
  "neutral",
  "cap_not_closed",
  "cap_partial",
  "cap_not_run",
  "cap_not_claim",
  "candidate",
  "confirmed",
  "not_reproduced",
  "inconclusive",
  "live",
  "scripted",
  "recorded",
  "blocked_as_expected",
  "signal",
  "matched_violation",
  "diverged",
  "error",
] as const;

export type PillKind = (typeof PILL_KINDS)[number];

type Props = {
  kind: PillKind;
  label: string;
};

export function StatusPill({ kind, label }: Props) {
  const className = `${styles.pill} ${styles[kind] ?? ""}`;
  return <span className={className}>{label}</span>;
}
