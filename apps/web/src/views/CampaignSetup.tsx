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
  const thor = session.thorDualAgent;
  const canEnable = Boolean(thor?.canEnableLiveAgents);
  const provenance = session.provenanceMode;
  const actors =
    thor?.evidence.actorIds.length
      ? thor.evidence.actorIds.join(" / ")
      : "player-a / player-b";

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
        <StatusPill
          kind={provenance}
          label={PROVENANCE_LABELS[provenance]}
        />
        <StatusPill
          kind={session.live ? "scripted" : "inconclusive"}
          label={session.live ? "Control API connected" : "Control API offline"}
        />
        {session.liveAgentsEnabled ? (
          <>
            <StatusPill kind="blocked_as_expected" label="SSH≠G4" />
            <StatusPill kind="blocked_as_expected" label="paid $0" />
            <StatusPill kind="inconclusive" label="pitch not closed" />
          </>
        ) : null}
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
          <strong>
            {provenance}
            {session.liveAgentsEnabled
              ? ` — Thor SSH dual-agent (${actors}; not AgenC dual sessions)`
              : ""}
          </strong>
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

      {session.liveAgentsEnabled && thor ? (
        <div className={styles.field}>
          <span>Thor dual-agent evidence (#48)</span>
          <strong>
            {thor.evidence.status ?? "n/a"}
            {thor.evidence.rb011 ? ` · rb011 ${thor.evidence.rb011}` : ""}
            {thor.evidence.dualAgentEvidence
              ? ` · ${thor.evidence.dualAgentEvidence}`
              : ""}
          </strong>
          <p className={styles.meta}>
            Path: Thor SSH → networked local Ollama ({thor.thorHost}) · G4{" "}
            {thor.g4P3}/{thor.g4P4} · CLI generate via{" "}
            <span className="mono">npm run spike:thor-dual</span> (browser does not
            SSH).
          </p>
        </div>
      ) : null}

      {session.error ? <p className={styles.warnNote}>{session.error}</p> : null}

      <p className={styles.warnNote}>
        {session.liveAgentsEnabled
          ? "Live provenance enabled for Thor SSH dual-agent evidence (player-a / player-b). This is not AgenC daemon dual sessions. SSH ≠ G4 containment; G4 stays Not run; paid cloud $0; pitch not closed. Control API campaigns remain scripted."
          : canEnable
            ? "Thor dual-agent path is available for live provenance enablement (#48 evidence and/or live gate). Scripted campaigns stay the control-API default. SSH ≠ G4; paid cloud $0; not AgenC dual sessions; pitch not closed."
            : "Thor dual-agent live provenance stays locked until RULEBREAK_LIVE_ENABLED + Thor credentials, or a Pass #48 evidence artifact is present. SSH ≠ G4; paid cloud $0."}
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
        <button
          type="button"
          className={styles.secondary}
          disabled={!session.live || busy || (!canEnable && !session.liveAgentsEnabled)}
          onClick={() =>
            session.setLiveAgentsEnabled(!session.liveAgentsEnabled)
          }
        >
          {session.liveAgentsEnabled
            ? "Disable Thor dual-agent provenance"
            : canEnable
              ? "Enable Thor dual-agent (SSH≠G4)"
              : "Enable live agents (locked — need Thor path)"}
        </button>
      </div>
    </section>
  );
}
