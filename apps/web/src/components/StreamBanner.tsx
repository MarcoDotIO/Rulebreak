import type { SessionStatus } from "../hooks/useCampaignSession";
import styles from "./MockBanner.module.css";

type Props = {
  live: boolean;
  streamStatus: SessionStatus;
};

export function StreamBanner({ live, streamStatus }: Props) {
  const label = !live
    ? "OFFLINE — control API not reachable (npm run dev:server)"
    : streamStatus === "streaming"
      ? "LIVE SCRIPTED STREAM — events from local campaign API"
      : streamStatus === "ready"
        ? "LIVE SCRIPTED — campaign complete; evidence from durable store"
        : "LIVE API — scripted campaigns only (not mock fixtures)";

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      {label}
    </div>
  );
}
