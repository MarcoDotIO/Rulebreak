import { PROVENANCE_LABELS } from "../mocks/campaignMock";
import { summarizeEvent } from "../api/summarizeEvent";
import { StatusPill } from "../components/StatusPill";
import type { CampaignSessionState } from "../hooks/useCampaignSession";
import styles from "./views.module.css";

type Props = {
  session: CampaignSessionState;
  onOpenFinding: () => void;
};

export function ActivityTimeline({ session, onOpenFinding }: Props) {
  const campaign = session.campaign;
  const usage = session.usage;

  if (!campaign) {
    return (
      <section className={styles.panel}>
        <h1 className={styles.h}>Activity timeline</h1>
        <p className={styles.sub}>
          Start a scripted campaign from setup to stream real events.
        </p>
        {session.error ? <p className={styles.warnNote}>{session.error}</p> : null}
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="timeline-heading">
      <div className={styles.row} style={{ justifyContent: "space-between" }}>
        <div>
          <h1 className={styles.h} id="timeline-heading">
            Activity timeline
          </h1>
          <p className={styles.sub}>
            Actor-labeled actions, outcomes, and rules checked — campaign{" "}
            <span className="mono">{campaign.campaignId}</span> (status{" "}
            {campaign.status})
          </p>
        </div>
        <div className={styles.actions}>
          <StatusPill
            kind={campaign.mode}
            label={PROVENANCE_LABELS[campaign.mode]}
          />
          <button
            type="button"
            className={styles.danger}
            onClick={() => void session.requestStop()}
          >
            Stop
          </button>
        </div>
      </div>

      <p className={styles.meta}>
        Usage: {usage?.toolCalls ?? 0} tool calls, {usage?.mutations ?? 0}{" "}
        mutations, {usage?.tokens ?? 0} tokens, ${usage?.costUsd ?? 0}
        {session.status === "streaming" ? " — streaming…" : ""}
      </p>

      <ul className={styles.list}>
        {session.events.map((event) => {
          const { actorLabel, summary } = summarizeEvent(event);
          return (
            <li key={event.eventId} className={styles.item}>
              <div className={styles.row}>
                <StatusPill kind={event.mode} label={actorLabel} />
                <strong>
                  <span className={styles.seq}>#{event.sequence}</span>{" "}
                  {event.type}
                </strong>
              </div>
              <div>{summary}</div>
              <div className={styles.meta}>
                <span className="mono">{event.eventId}</span>
                {" — "}
                {event.timestamp}
                {" — "}
                {PROVENANCE_LABELS[event.mode]}
              </div>
            </li>
          );
        })}
      </ul>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          disabled={!session.finding}
          onClick={onOpenFinding}
        >
          Open finding detail
        </button>
      </div>
    </section>
  );
}
