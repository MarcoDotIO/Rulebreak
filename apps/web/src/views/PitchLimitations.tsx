import { StatusPill } from "../components/StatusPill";
import {
  PITCH_CAN_SAY,
  PITCH_CAPS,
  PITCH_DEMO_GRAVITY,
  PITCH_FREEZE_BASIS,
  PITCH_NON_CLAIMS,
} from "./pitchCaps";
import styles from "./views.module.css";

/** Render `backticked` command/path tokens as non-wrapping code so they never split mid-token. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/`([^`]+)`/).map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className={styles.cmd}>
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function PitchLimitations() {
  return (
    <section
      className={`${styles.panel} ${styles.panelFinding}`}
      aria-labelledby="pitch-heading"
    >
      <div>
        <h1 className={styles.h} id="pitch-heading">
          Pitch limitations
        </h1>
        <p className={styles.sub}>
          Demo freeze: what we can honestly sell now. Read this before any
          demo; if a claim is not on this page, do not make it.
        </p>
        <p className={styles.meta}>Freeze basis: {PITCH_FREEZE_BASIS}</p>
      </div>

      <div className={styles.row} aria-label="Honesty chips">
        <StatusPill kind="confirmed" label="Offline P0 = demo center" />
        <StatusPill kind="candidate" label="pitch not closed" />
        <StatusPill kind="blocked_as_expected" label="SSH≠G4" />
        <StatusPill kind="inconclusive" label="not AgenC dual sessions" />
        <StatusPill kind="candidate" label="M13 Partial-on-UI-SSH" />
        <StatusPill kind="inconclusive" label="G4-P3/P4 Not run" />
        <StatusPill kind="blocked_as_expected" label="paid $0" />
        <StatusPill
          kind="blocked_as_expected"
          label="blocked_as_expected ≠ secure"
        />
      </div>

      <p className={styles.warnNote}>{PITCH_DEMO_GRAVITY}</p>

      <div>
        <h2 className={styles.h2}>Hard honesty caps</h2>
        <ul className={styles.capList} aria-label="Hard honesty caps">
          {PITCH_CAPS.map((cap) => (
            <li key={cap.id} className={styles.capItem} data-cap={cap.id}>
              <div className={styles.row}>
                <strong>{cap.title}</strong>
                <StatusPill kind={cap.pillKind} label={cap.pillLabel} />
              </div>
              <p className={styles.capBody}>
                <Inline text={cap.body} />
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className={styles.h2}>Safe to say</h2>
        <ul className={styles.limitations}>
          {PITCH_CAN_SAY.map((item) => (
            <li key={item}>
              <Inline text={item} />
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className={styles.h2}>Do not claim</h2>
        <ul className={styles.limitations}>
          {PITCH_NON_CLAIMS.map((item) => (
            <li key={item}>
              <Inline text={item} />
            </li>
          ))}
        </ul>
      </div>

      <p className={styles.warnNote}>
        Never present blocked_as_expected as "secure." Thor SSH evidence (#48)
        and dual-agent UI enablement (#50) do not imply a G4 Pass or a closed
        pitch.
      </p>
    </section>
  );
}
