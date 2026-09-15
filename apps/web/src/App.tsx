import { useState } from "react";
import { AppShell, type ViewId } from "./components/AppShell";
import { CampaignSetup } from "./views/CampaignSetup";
import { ActivityTimeline } from "./views/ActivityTimeline";
import { FindingDetail } from "./views/FindingDetail";
import { useCampaignSession } from "./hooks/useCampaignSession";

export function App() {
  const [view, setView] = useState<ViewId>("setup");
  const session = useCampaignSession();

  return (
    <AppShell
      view={view}
      onNavigate={setView}
      live={session.live}
      streamStatus={session.status}
    >
      {view === "setup" ? (
        <CampaignSetup
          session={session}
          onStarted={() => setView("timeline")}
        />
      ) : null}
      {view === "timeline" ? (
        <ActivityTimeline
          session={session}
          onOpenFinding={() => setView("finding")}
        />
      ) : null}
      {view === "finding" ? <FindingDetail session={session} /> : null}
    </AppShell>
  );
}
