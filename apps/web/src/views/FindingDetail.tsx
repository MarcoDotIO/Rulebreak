import {
  PROVENANCE_LABELS,
  mockBalanceEvidence,
  mockFinding,
  mockLimitations,
  mockReplay,
} from "../mocks/campaignMock";
import { StatusPill } from "../components/StatusPill";
import styles from "./views.module.css";

const beforeRows = Object.keys(mockBalanceEvidence.before) as Array<
  keyof typeof mockBalanceEvidence.before
>;

export function FindingDetail() {
  return (
    <section className={styles.panel} aria-labelledby="finding-heading">
      <div>
        <h1 className={styles.h} id="finding-heading">
          Finding detail
        </h1>
        <p className={styles.sub}>
          Failed rule, responsible action, before/after evidence, replay status.
        </p>
      </div>

      <div className={styles.row}>
        <StatusPill kind={mockFinding.status} label={mockFinding.status} />
        <StatusPill
          kind={mockFinding.mode}
          label={PROVENANCE_LABELS[mockFinding.mode]}
        />
        <StatusPill
          kind={mockFinding.mode}
          label={`Replay: ${mockReplay.outcome}`}
        />
      </div>

      <div className={styles.grid}>
        <div className={styles.field}>
          <span>Failed invariant</span>
          <strong>{mockFinding.violation.invariantId}</strong>
        </div>
        <div className={styles.field}>
          <span>Responsible action</span>
          <strong>{mockFinding.violation.logicalActionId}</strong>
        </div>
        <div className={styles.field}>
          <span>Finding ID</span>
          <strong>{mockFinding.findingId}</strong>
        </div>
        <div className={styles.field}>
          <span>Target</span>
          <strong>{mockFinding.targetId}</strong>
        </div>
        <div className={styles.field}>
          <span>Rule pack version</span>
          <strong>{mockFinding.rulePackVersion}</strong>
        </div>
        <div className={styles.field}>
          <span>State hashes</span>
          <strong>
            {mockFinding.violation.preStateHash} →{" "}
            {mockFinding.violation.postStateHash}
          </strong>
        </div>
      </div>

      <p>{mockFinding.violation.message}</p>

      <table className={styles.table}>
        <caption className={styles.meta}>
          Before / after evidence (mock snapshot summary)
        </caption>
        <thead>
          <tr>
            <th scope="col">Key</th>
            <th scope="col">Before</th>
            <th scope="col">After</th>
          </tr>
        </thead>
        <tbody>
          {beforeRows.map((key) => (
            <tr key={key}>
              <td>{key}</td>
              <td>{mockBalanceEvidence.before[key]}</td>
              <td>{mockBalanceEvidence.after[key]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.field}>
        <span>Replay result ({mockReplay.targetId})</span>
        <strong>
          {mockReplay.outcome}
          {mockReplay.message ? ` — ${mockReplay.message}` : ""}
        </strong>
      </div>

      <div>
        <h2 className={styles.h} style={{ fontSize: "1rem" }}>
          Limitations
        </h2>
        <ul>
          {mockLimitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <p className={styles.warnNote}>
        Never show a green “secure” badge after a bounded negative run. Clean-target
        control belongs in replay comparison after RB-009.
      </p>
    </section>
  );
}
