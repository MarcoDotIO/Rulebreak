import type { ReactNode } from "react";
import { MockBanner } from "./MockBanner";
import styles from "./AppShell.module.css";

export type ViewId = "setup" | "timeline" | "finding";

type Props = {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
  children: ReactNode;
};

const LABELS: Record<ViewId, string> = {
  setup: "Campaign setup",
  timeline: "Activity timeline",
  finding: "Finding detail",
};

export function AppShell({ view, onNavigate, children }: Props) {
  return (
    <div className={styles.shell}>
      <MockBanner />
      <header className={styles.header}>
        <div className={styles.brand}>
          <strong>Rulebreak evidence UI</strong>
          <span>Evidence first — not a chat wall</span>
        </div>
        <nav className={styles.nav} aria-label="Primary">
          {(Object.keys(LABELS) as ViewId[]).map((id) => (
            <button
              key={id}
              type="button"
              aria-current={view === id ? "page" : undefined}
              onClick={() => onNavigate(id)}
            >
              {LABELS[id]}
            </button>
          ))}
        </nav>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
