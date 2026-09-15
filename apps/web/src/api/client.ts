import type {
  Campaign,
  CampaignEvent,
  Finding,
  ReplayResult,
  TargetManifest,
  UsageLedger,
} from "@rulebreak/contracts";

const API_BASE = "";

export type CreateCampaignResponse = {
  campaign: Campaign;
  finding: Finding | null;
  replay: ReplayResult | null;
  outcome: string;
  usage: UsageLedger;
  eventCount: number;
};

export type CampaignDetail = {
  campaign: Campaign;
  finding: Finding | null;
  replay: ReplayResult | null;
  usage: UsageLedger;
  eventCount: number;
};

export type FindingDetailResponse = {
  finding: Finding;
  replay: ReplayResult | null;
  campaign: Campaign;
  evidence: Record<string, { before: string; after: string }> | null;
  exportDir: string | null;
};

export type TargetsResponse = {
  targets: TargetManifest[];
  rulePacks: Array<{ rulePackId: string; version: string }>;
};

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${path}: ${body || res.statusText}`);
  }
  return (await res.json()) as T;
}

export function fetchHealth() {
  return json<{ ok: boolean; mode: string }>("/api/health");
}

export function fetchTargets() {
  return json<TargetsResponse>("/api/targets");
}

export function createCampaign(fixtureMode: "fixed" | "faulty" = "faulty") {
  return json<CreateCampaignResponse>("/api/campaigns", {
    method: "POST",
    body: JSON.stringify({ fixtureMode }),
  });
}

export function fetchCampaign(id: string) {
  return json<CampaignDetail>(`/api/campaigns/${encodeURIComponent(id)}`);
}

export function fetchFinding(id: string) {
  return json<FindingDetailResponse>(`/api/findings/${encodeURIComponent(id)}`);
}

export function stopCampaign(id: string) {
  return json<{ campaign: Campaign }>(
    `/api/campaigns/${encodeURIComponent(id)}/stop`,
    { method: "POST", body: "{}" },
  );
}

export function streamCampaignEvents(
  campaignId: string,
  handlers: {
    onEvent: (event: CampaignEvent) => void;
    onDone?: () => void;
    onError?: (err: Event) => void;
    after?: number;
  },
): () => void {
  const after = handlers.after ?? 0;
  const url = `/api/campaigns/${encodeURIComponent(campaignId)}/events?after=${after}`;
  const source = new EventSource(url);

  source.addEventListener("campaign", (msg) => {
    try {
      const event = JSON.parse((msg as MessageEvent).data) as CampaignEvent;
      handlers.onEvent(event);
    } catch {
      // ignore malformed
    }
  });

  source.addEventListener("done", () => {
    handlers.onDone?.();
    source.close();
  });

  source.onerror = (err) => {
    handlers.onError?.(err);
    source.close();
  };

  return () => source.close();
}
