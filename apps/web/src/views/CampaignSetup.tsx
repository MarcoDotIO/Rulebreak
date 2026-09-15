import { PROVENANCE_LABELS } from "../mocks/campaignMock";
import { StatusPill } from "../components/StatusPill";
import type { CampaignSessionState } from "../hooks/useCampaignSession";
import styles from "./views.module.css";

type Props = {
  session: CampaignSessionState;
  onStarted: () => void;
};

export function CampaignSetup({ session, onStarted }: Props) {
  const faulty =
    session.targets.find((t) => t.fixtureMode === "faulty") ??
    session.targets[0];
  const busy =
    session.status === "connecting" || session.status === "streaming";

  return (
    <section className={styles.panel} aria-labelledby="setup-heading">
      <div>
        <h1 className={styles.h} id="setup-heading">
          Campaign setup
        </h1>
        <p className={styles.sub}>
          Bundled target, rule pack, mode, budgets, and explicit spend confirmation
          before start.
        </p>
      </div>

      <div className={styles.row}>
        <StatusPill kind="scripted" label={PROVENANCE_LABELS.scripted} />
        <StatusPill
          kind={session.live ? "scripted" : "inconclusive"}
          label={session.live ? "Control API connected" : "Control API offline"}
        />
      </div>

      <div className={styles.grid}>
        <label className={styles.field}>
          <span>Target</span>
          <strong>
            {faulty ? (
              <>
                {faulty.displayName}{" "}
                <span className="mono">({faulty.targetId})</span>
              </>
            ) : (
              <span className="mono">synthetic-trade-faulty</span>
            )}
          </strong>
        </label>
        <label className={styles.field}>
          <span>Fixture mode</span>
          <strong>{faulty?.fixtureMode ?? "faulty"}</strong>
        </label>
        <label className={styles.field}>
          <span>Rule pack</span>
          <strong className="mono">{session.rulePackId}</strong>
        </label>
        <label className={styles.field}>
          <span>Provenance</span>
          <strong>scripted</strong>
        </label>
        <label className={styles.field}>
          <span>Max cost (USD)</span>
          <strong>0</strong>
        </label>
        <label className={styles.field}>
          <span>Max mutations</span>
          <strong>100</strong>
        </label>
        <label className={styles.field}>
          <span>Spend confirmed</span>
          <strong>Yes (offline $0)</strong>
        </label>
      </div>

      {session.error ? <p className={styles.warnNote}>{session.error}</p> : null}

      <p className={styles.warnNote}>
        Live AgenC explorers stay disabled. Start runs the known trade-failure
        script against the synthetic economy and streams durable events.
      </p>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          disabled={!session.live || busy}
          onClick={async () => {
            await session.startFaulty();
            onStarted();
          }}
        >
          {busy ? "Running…" : "Start scripted campaign"}
        </button>
        <button type="button" className={styles.secondary} disabled>
          Enable live agents (blocked)
        </button>
      </div>
    </section>
  );
}
