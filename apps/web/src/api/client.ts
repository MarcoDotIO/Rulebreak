import type {
  Campaign,
  CampaignEvent,
  Finding,
  ReplayResult,
  TargetManifest,
  UsageLedger,
} from "@rulebreak/contracts";

import { parseDonePayload, type TerminalStatus } from "./terminalStatus";

const API_BASE = "";

export type ThorDualAgentCapabilities = {
  canEnableLiveAgents: boolean;
  liveGateOpen: boolean;
  thorPasswordConfigured: boolean;
  thorHost: string;
  thorUser: string;
  pathKind: "thor_ssh_dual_ollama";
  notAgenCDualSessions: true;
  paidCloudCapUsd: 0;
  sshIsG4Containment: false;
  g4P3: "Not run";
  g4P4: "Not run";
  pitchClosed: false;
  evidence: {
    present: boolean;
    status: string | null;
    rb011: string | null;
    dualAgentEvidence: string | null;
    actorIds: string[];
    note: string | null;
  };
  honestyNotes: string[];
};

export type HealthResponse = {
  ok: boolean;
  mode: string;
  service?: string;
  thorDualAgent?: ThorDualAgentCapabilities;
};

export type CreateCampaignResponse = {
  campaign: Campaign;
  finding: Finding | null;
  /** Same-target confirming replay; drives durable candidate→confirmed. */
  confirmReplay?: ReplayResult | null;
  /** Fixed-target control; does not promote the finding. */
  replay: ReplayResult | null;
  /** RB-020: same terminal status as the done event and GET. */
  status: string;
  outcome: string;
  usage: UsageLedger;
  eventCount: number;
};

export type CampaignDetail = {
  campaign: Campaign;
  /** RB-020 terminal status (docs/contracts/rb-020-terminal-status.md). */
  status: string;
  outcome: string | null;
  finding: Finding | null;
  confirmReplay?: ReplayResult | null;
  replay: ReplayResult | null;
  usage: UsageLedger;
  eventCount: number;
};

export type FindingDetailResponse = {
  finding: Finding;
  confirmReplay?: ReplayResult | null;
  replay: ReplayResult | null;
  campaign: Campaign;
  evidence: Record<string, { before: string; after: string }> | null;
  exportDir: string | null;
};

export type TargetsResponse = {
  targets: TargetManifest[];
  rulePacks: Array<{ rulePackId: string; version: string }>;
};

/**
 * A non-2xx control-API response. RB-021 types the campaign errors in the
 * contract's table with `{ error, code }` (`start_error` also carries
 * `campaignId`, `status` and `outcome`). Other responses, such as the operator
 * 401/503, may have no `code`; `code` is then null and the UI treats it as a
 * request failure, never as `start_error`.
 */
export class ApiError extends Error {
  readonly httpStatus: number;
  readonly code: string | null;
  readonly campaignId: string | null;
  readonly status: string | null;
  readonly outcome: string | null;

  constructor(httpStatus: number, path: string, body: string) {
    let parsed: Record<string, unknown> = {};
    try {
      const value = JSON.parse(body) as unknown;
      if (value && typeof value === "object") parsed = value as Record<string, unknown>;
    } catch {
      // non-JSON body; keep the text in the message only
    }
    const str = (k: string) => (typeof parsed[k] === "string" ? (parsed[k] as string) : null);
    super(`${httpStatus} ${path}: ${str("error") ?? body}`);
    this.name = "ApiError";
    this.httpStatus = httpStatus;
    this.code = str("code");
    this.campaignId = str("campaignId");
    this.status = str("status");
    this.outcome = str("outcome");
  }
}

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
    throw new ApiError(res.status, path, body || res.statusText);
  }
  return (await res.json()) as T;
}

export function fetchHealth() {
  return json<HealthResponse>("/api/health");
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
    /** RB-020: payload carries status/outcome; ok:true only means the stream finished. */
    onDone?: (terminal: TerminalStatus | null) => void;
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

  source.addEventListener("done", (msg) => {
    handlers.onDone?.(parseDonePayload((msg as MessageEvent).data));
    source.close();
  });

  source.onerror = (err) => {
    handlers.onError?.(err);
    source.close();
  };

  return () => source.close();
}

/** User-facing line for a request that failed without a typed campaign code. */
export function requestFailureText(err: unknown): string {
  if (err instanceof ApiError) {
    return `Request failed (HTTP ${err.httpStatus}); no campaign status was returned.`;
  }
  return "Request failed; no campaign status was returned.";
}
