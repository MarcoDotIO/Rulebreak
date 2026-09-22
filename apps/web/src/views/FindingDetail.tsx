import { PROVENANCE_LABELS } from "../mocks/campaignMock";
import { StatusPill } from "../components/StatusPill";
import type { CampaignSessionState } from "../hooks/useCampaignSession";
import styles from "./views.module.css";

type Props = {
  session: CampaignSessionState;
};

function replayPillKind(outcome: string): string {
  if (outcome === "blocked_as_expected") return "blocked_as_expected";
  if (outcome === "matched_violation") return "matched_violation";
  if (outcome === "diverged" || outcome === "error") return outcome;
  return "inconclusive";
}

export function FindingDetail({ session }: Props) {
  const finding = session.finding;
  const replay = session.replay;
  const evidence = session.evidence;
  const rows = evidence ? Object.keys(evidence) : [];
  const uiProvenance = session.provenanceMode;
  const thor = session.thorDualAgent;

  const limitations = [
    "Synthetic economy only — not a live game server",
    session.liveAgentsEnabled
      ? "Live provenance = Thor SSH dual-agent (player-a / player-b Ollama) — not AgenC daemon dual sessions"
      : "Scripted driver path; enable Thor dual-agent provenance from setup when the Thor path or #48 evidence is available",
    "Thor SSH live generate stays CLI (`spike:thor-dual`) — browser does not SSH; SSH ≠ G4 containment; G4 Not run",
    "Evidence and replay for control-API campaigns come from the local store; pitch not closed; paid cloud $0",
  ] as const;

  if (!finding) {
    return (
      <section className={styles.panel}>
        <h1 className={styles.h}>Finding detail</h1>
        <p className={styles.sub}>
          No finding yet — run the faulty scripted campaign first.
        </p>
        {session.liveAgentsEnabled ? (
          <p className={styles.warnNote}>
            Thor dual-agent live provenance is on (SSH≠G4; not AgenC; pitch not
            closed). That does not invent a finding — start the scripted campaign
            or inspect CLI evidence via{" "}
            <span className="mono">spike:thor-dual</span>.
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className={`${styles.panel} ${styles.panelFinding}`}
      aria-labelledby="finding-heading"
    >
      <div>
        <h1 className={styles.h} id="finding-heading">
          Finding detail
        </h1>
        <p className={styles.sub}>
          Failed rule, responsible action, before/after evidence, replay status.
        </p>
      </div>

      <div className={styles.row}>
        <StatusPill kind={finding.status} label={finding.status} />
        <StatusPill
          kind={finding.mode}
          label={`${PROVENANCE_LABELS[finding.mode]} (campaign)`}
        />
        <StatusPill
          kind={uiProvenance}
          label={`${PROVENANCE_LABELS[uiProvenance]} (UI)`}
        />
        {session.liveAgentsEnabled ? (
          <StatusPill kind="blocked_as_expected" label="SSH≠G4" />
        ) : null}
        {replay ? (
          <StatusPill
            kind={replayPillKind(replay.outcome)}
            label={`Replay: ${replay.outcome}`}
          />
        ) : null}
      </div>

      <div className={styles.grid}>
        <div className={styles.field}>
          <span>Failed invariant</span>
          <strong className="mono">{finding.violation.invariantId}</strong>
        </div>
        <div className={styles.field}>
          <span>Responsible action</span>
          <strong className="mono">{finding.violation.logicalActionId}</strong>
        </div>
        <div className={styles.field}>
          <span>Finding ID</span>
          <strong className="mono">{finding.findingId}</strong>
        </div>
        <div className={styles.field}>
          <span>Target</span>
          <strong className="mono">{finding.targetId}</strong>
        </div>
        <div className={styles.field}>
          <span>Rule pack version</span>
          <strong>{finding.rulePackVersion}</strong>
        </div>
        <div className={styles.field}>
          <span>State hashes</span>
          <strong className="mono">
            {finding.violation.preStateHash} to {finding.violation.postStateHash}
          </strong>
        </div>
      </div>

      <p>{finding.violation.message}</p>

      {rows.length > 0 ? (
        <table className={styles.table}>
          <caption className={styles.meta}>
            Before / after evidence (from durable world snapshots)
          </caption>
          <thead>
            <tr>
              <th scope="col">Key</th>
              <th scope="col">Before</th>
              <th scope="col">After</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((key) => (
              <tr key={key}>
                <td className="mono">{key}</td>
                <td>{evidence![key]!.before}</td>
                <td>{evidence![key]!.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className={styles.meta}>
          Snapshot table unavailable — hashes above are authoritative.
        </p>
      )}

      {replay ? (
        <div className={styles.field}>
          <span>Replay result ({replay.targetId})</span>
          <strong>
            {replay.outcome}
            {replay.message ? ` — ${replay.message}` : ""}
          </strong>
        </div>
      ) : null}

      {session.liveAgentsEnabled && thor?.evidence.present ? (
        <div className={styles.field}>
          <span>Thor dual-agent evidence (not campaign finding)</span>
          <strong>
            {thor.evidence.status} · {thor.evidence.dualAgentEvidence} · actors{" "}
            {thor.evidence.actorIds.join(", ") || "player-a, player-b"}
          </strong>
        </div>
      ) : null}

      <div>
        <h2 className={styles.h2}>Limitations</h2>
        <ul className={styles.limitations}>
          {limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <p className={styles.warnNote}>
        Never show a green “secure” badge after a bounded negative run. Fixed-target
        control replay should report blocked_as_expected, not “secure.” Thor SSH
        evidence alone is not G4 Pass or a closed pitch.
      </p>
    </section>
  );
}
