import {
  PROVENANCE_LABELS,
  mockBudgets,
  mockCampaign,
  mockTarget,
} from "../mocks/campaignMock";
import { StatusPill } from "../components/StatusPill";
import styles from "./views.module.css";

type Props = {
  onStart: () => void;
};

export function CampaignSetup({ onStart }: Props) {
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
          kind={mockCampaign.mode}
          label={PROVENANCE_LABELS[mockCampaign.mode]}
        />
        <StatusPill kind="candidate" label="Not started (mock)" />
      </div>

      <div className={styles.grid}>
        <label className={styles.field}>
          <span>Target</span>
          <strong>
            {mockTarget.displayName} ({mockTarget.targetId})
          </strong>
        </label>
        <label className={styles.field}>
          <span>Fixture mode</span>
          <strong>{mockTarget.fixtureMode}</strong>
        </label>
        <label className={styles.field}>
          <span>Rule pack</span>
          <strong>{mockCampaign.rulePackId}</strong>
        </label>
        <label className={styles.field}>
          <span>Provenance</span>
          <strong>{mockCampaign.mode}</strong>
        </label>
        <label className={styles.field}>
          <span>Max cost (USD)</span>
          <strong>{mockBudgets.maxCostUsd}</strong>
        </label>
        <label className={styles.field}>
          <span>Max mutations</span>
          <strong>{mockBudgets.maxMutations}</strong>
        </label>
        <label className={styles.field}>
          <span>Spend confirmed</span>
          <strong>{mockBudgets.spendConfirmed ? "Yes (offline $0)" : "No"}</strong>
        </label>
      </div>

      <p className={styles.warnNote}>
        Live agents stay disabled until RB-003/RB-004 boundaries and spend approval
        exist. This mock always starts the scripted driver path.
      </p>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onStart}>
          Start scripted campaign
        </button>
        <button type="button" className={styles.secondary} disabled>
          Enable live agents (blocked)
        </button>
      </div>
    </section>
  );
}
