import type { SessionStatus } from "../hooks/useCampaignSession";
import styles from "./MockBanner.module.css";

type Props = {
  live: boolean;
  streamStatus: SessionStatus;
  /** Operator enabled Thor dual-agent live provenance (not AgenC; SSH≠G4). */
  liveAgentsEnabled?: boolean;
};

export function StreamBanner({
  live,
  streamStatus,
  liveAgentsEnabled = false,
}: Props) {
  let label: string;
  if (!live) {
    label =
      "Offline — control API not reachable (npm run dev:server)";
  } else if (liveAgentsEnabled) {
    label =
      streamStatus === "streaming"
        ? "Live provenance on — Thor SSH dual-agent (player-a/player-b); stream still scripted · SSH≠G4 · pitch not closed"
        : streamStatus === "ready"
          ? "Live provenance on — Thor dual-agent evidence path; campaign events are scripted · SSH≠G4 · paid $0"
          : "Live provenance enabled — Thor SSH dual-agent (not AgenC dual sessions) · SSH≠G4 · pitch not closed";
  } else if (streamStatus === "streaming") {
    label = "Live scripted stream — events from local campaign API";
  } else if (streamStatus === "ready") {
    label =
      "Live scripted — campaign complete; evidence from durable store";
  } else {
    label =
      "Live API — scripted campaigns default; Thor dual-agent provenance optional (SSH≠G4)";
  }

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      {label}
    </div>
  );
}
