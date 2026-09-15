import { useState } from "react";
import { AppShell, type ViewId } from "./components/AppShell";
import { CampaignSetup } from "./views/CampaignSetup";
import { ActivityTimeline } from "./views/ActivityTimeline";
import { FindingDetail } from "./views/FindingDetail";

export function App() {
  const [view, setView] = useState<ViewId>("setup");

  return (
    <AppShell view={view} onNavigate={setView}>
      {view === "setup" ? (
        <CampaignSetup onStart={() => setView("timeline")} />
      ) : null}
      {view === "timeline" ? (
        <ActivityTimeline onOpenFinding={() => setView("finding")} />
      ) : null}
      {view === "finding" ? <FindingDetail /> : null}
    </AppShell>
  );
}
