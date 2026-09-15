import type { SessionStatus } from "../hooks/useCampaignSession";
import styles from "./MockBanner.module.css";

type Props = {
  live: boolean;
  streamStatus: SessionStatus;
};

export function StreamBanner({ live, streamStatus }: Props) {
  const label = !live
    ? "Offline — control API not reachable (npm run dev:server)"
    : streamStatus === "streaming"
      ? "Live scripted stream — events from local campaign API"
      : streamStatus === "ready"
        ? "Live scripted — campaign complete; evidence from durable store"
        : "Live API — scripted campaigns only (not mock fixtures)";

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      {label}
    </div>
  );
}
