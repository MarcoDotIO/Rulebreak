import { MOCK_BANNER } from "../mocks/campaignMock";
import styles from "./MockBanner.module.css";

export function MockBanner() {
  return (
    <div className={styles.banner} role="status" aria-live="polite">
      {MOCK_BANNER}
    </div>
  );
}
