import { StatusPill } from "../components/StatusPill";
import {
  PITCH_CAPS,
  PITCH_DEMO_GRAVITY,
  PITCH_NON_CLAIMS,
} from "./pitchLimitations";
import styles from "./views.module.css";

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
          Demo freeze — what Candidate A can honestly sell now. Operator scan
          sheet; accuracy over marketing.
        </p>
      </div>

      <div className={styles.row} aria-label="Honesty chips">
        <StatusPill kind="confirmed" label="Offline P0 = demo center" />
        <StatusPill kind="candidate" label="pitch not closed" />
        <StatusPill kind="blocked_as_expected" label="SSH≠G4" />
        <StatusPill kind="blocked_as_expected" label="paid $0" />
        <StatusPill kind="inconclusive" label="G4 Not run" />
        <StatusPill kind="scripted" label="M13 Partial-on-UI-SSH" />
        <StatusPill
          kind="blocked_as_expected"
          label="blocked_as_expected ≠ secure"
        />
      </div>

      <p className={styles.warnNote}>{PITCH_DEMO_GRAVITY}</p>

      <div>
        <h2 className={styles.h2}>Hard honesty caps</h2>
        <p className={styles.meta}>
          Must stay visible. No greenwashing. Archivist may skim — prefer
          accurate wording.
        </p>
        <ul className={styles.capList}>
          {PITCH_CAPS.map((cap) => (
            <li key={cap.id} className={styles.capItem}>
              <div className={styles.row}>
                <strong>{cap.title}</strong>
                <StatusPill kind={cap.pillKind} label={cap.pillLabel} />
              </div>
              <p className={styles.capBody}>{cap.body}</p>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className={styles.h2}>Do not sell</h2>
        <ul className={styles.limitations}>
          {PITCH_NON_CLAIMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <p className={styles.warnNote}>
        Never treat blocked_as_expected as "secure." Never imply G4 Pass from
        Thor SSH (#48) or dual-agent UI unlock (#50). Navigate here from the
        primary nav — no narration required for shareholder/demo freeze.
      </p>
    </section>
  );
}
