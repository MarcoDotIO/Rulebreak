import { mockCampaign, mockTimeline } from "../mocks/campaignMock";
import { StatusPill } from "../components/StatusPill";
import styles from "./views.module.css";

type Props = {
  onOpenFinding: () => void;
};

export function ActivityTimeline({ onOpenFinding }: Props) {
  return (
    <section className={styles.panel} aria-labelledby="timeline-heading">
      <div className={styles.row} style={{ justifyContent: "space-between" }}>
        <div>
          <h1 className={styles.h} id="timeline-heading">
            Activity timeline
          </h1>
          <p className={styles.sub}>
            Actor-labeled actions, balances, and rules checked — campaign{" "}
            {mockCampaign.id}
          </p>
        </div>
        <div className={styles.actions}>
          <StatusPill kind={mockCampaign.mode} label="Scripted fixture" />
          <button type="button" className={styles.danger}>
            Stop
          </button>
        </div>
      </div>

      <ul className={styles.list}>
        {mockTimeline.map((event) => (
          <li key={event.eventId} className={styles.item}>
            <div className={styles.row}>
              <StatusPill kind="scripted_fixture" label={event.actor} />
              <strong>
                #{event.sequence} · {event.type}
              </strong>
            </div>
            <div>{event.summary}</div>
            <div className={styles.meta}>
              {event.eventId} · {event.at}
              {event.balances
                ? ` · balances ${Object.entries(event.balances)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(", ")}`
                : ""}
            </div>
          </li>
        ))}
      </ul>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onOpenFinding}>
          Open finding detail
        </button>
      </div>
    </section>
  );
}
