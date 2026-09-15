import { mockFinding } from "../mocks/campaignMock";
import { StatusPill } from "../components/StatusPill";
import styles from "./views.module.css";

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
          kind="scripted_fixture"
          label={`Replay: ${mockFinding.replayStatus}`}
        />
      </div>

      <div className={styles.grid}>
        <div className={styles.field}>
          <span>Rule</span>
          <strong>
            {mockFinding.ruleId} — {mockFinding.ruleTitle}
          </strong>
        </div>
        <div className={styles.field}>
          <span>Responsible action</span>
          <strong>{mockFinding.responsibleActionId}</strong>
        </div>
        <div className={styles.field}>
          <span>Finding ID</span>
          <strong>{mockFinding.id}</strong>
        </div>
      </div>

      <table className={styles.table}>
        <caption className={styles.meta}>Before / after balances</caption>
        <thead>
          <tr>
            <th scope="col">Key</th>
            <th scope="col">Before</th>
            <th scope="col">After</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(mockFinding.before).map((key) => (
            <tr key={key}>
              <td>{key}</td>
              <td>{mockFinding.before[key]}</td>
              <td>{mockFinding.after[key]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div>
        <h2 className={styles.h} style={{ fontSize: "1rem" }}>
          Limitations
        </h2>
        <ul>
          {mockFinding.limitations.map((item) => (
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
