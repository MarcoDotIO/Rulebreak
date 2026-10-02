import { StatusPill } from "../components/StatusPill";
import type { PitchPillKind } from "./pitchCaps";

/**
 * A pill for pitch caps and chips. `kind` is a PitchPillKind, so passing a
 * finding status (`candidate`, `inconclusive`, ...) fails `tsc`.
 */
export function PitchPill({ kind, label }: { kind: PitchPillKind; label: string }) {
  return <StatusPill kind={kind} label={label} />;
}
