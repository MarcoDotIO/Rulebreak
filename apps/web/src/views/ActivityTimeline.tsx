import {
  PROVENANCE_LABELS,
  mockCampaign,
  mockEvents,
  mockUsage,
  summarizeEvent,
} from "../mocks/campaignMock";
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
            Actor-labeled actions, outcomes, and rules checked — campaign{" "}
            {mockCampaign.campaignId} (status {mockCampaign.status})
          </p>
        </div>
        <div className={styles.actions}>
          <StatusPill
            kind={mockCampaign.mode}
            label={PROVENANCE_LABELS[mockCampaign.mode]}
          />
          <button type="button" className={styles.danger}>
            Stop
          </button>
        </div>
      </div>

      <p className={styles.meta}>
        Usage (mock): {mockUsage.toolCalls} tool calls · {mockUsage.mutations}{" "}
        mutations · {mockUsage.tokens ?? 0} tokens · ${mockUsage.costUsd ?? 0}
      </p>

      <ul className={styles.list}>
        {mockEvents.map((event) => {
          const { actorLabel, summary } = summarizeEvent(event);
          return (
            <li key={event.eventId} className={styles.item}>
              <div className={styles.row}>
                <StatusPill kind={event.mode} label={actorLabel} />
                <strong>
                  #{event.sequence} · {event.type}
                </strong>
              </div>
              <div>{summary}</div>
              <div className={styles.meta}>
                {event.eventId} · {event.timestamp} ·{" "}
                {PROVENANCE_LABELS[event.mode]}
              </div>
            </li>
          );
        })}
      </ul>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onOpenFinding}>
          Open finding detail
        </button>
      </div>
    </section>
  );
}
