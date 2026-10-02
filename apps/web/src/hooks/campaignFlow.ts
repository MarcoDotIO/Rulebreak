import type { Campaign, Finding, ReplayResult, UsageLedger } from "@rulebreak/contracts";
import {
  ApiError,
  requestFailureText,
  type CampaignDetail,
  type FindingDetailResponse,
} from "../api/client.js";
import type { RefetchResult, TerminalStatus } from "../api/terminalStatus.js";

/**
 * Pure branching for useCampaignSession (RB-022), so each path is testable
 * without React. The hook applies these results to state.
 */

export const FINDING_LOAD_FAILED_TEXT = "Finding details could not be loaded.";

export type RefetchOutcome = {
  refetch: RefetchResult;
  terminal: TerminalStatus | null;
  campaign?: Campaign;
  finding?: Finding | null;
  /**
   * RB-023: usage from the GET refetch. On "ok" it replaces the POST snapshot
   * (null when GET sent none, so the line reads "not reported"); undefined when
   * the refetch failed, so the POST's counts stay.
   */
  usage?: UsageLedger | null;
};

/** After the stream closes, GET is the source of truth; `fallback` is the done payload. */
export async function refetchTerminal(
  campaignId: string,
  fallback: TerminalStatus | null,
  fetchCampaign: (id: string) => Promise<CampaignDetail>,
): Promise<RefetchOutcome> {
  try {
    const detail = await fetchCampaign(campaignId);
    return {
      refetch: "ok",
      terminal: { status: detail.status, outcome: detail.outcome },
      campaign: detail.campaign,
      finding: detail.finding,
      usage: detail.usage ?? null,
    };
  } catch (err) {
    // Only the server's typed code means the campaign is gone; a bare 404
    // (e.g. a missing route) is just a failed refetch.
    const notFound = err instanceof ApiError && err.code === "campaign_not_found";
    return { refetch: notFound ? "not_found" : "failed", terminal: fallback };
  }
}

export type FindingLoadOutcome =
  | {
      ok: true;
      evidence: FindingDetailResponse["evidence"];
      replay: ReplayResult | null;
    }
  | { ok: false; error: string };

/**
 * Loading finding details is separate from the run's status: a failure here
 * never touches the terminal status and never says "no campaign status".
 */
export async function loadFindingDetail(
  findingId: string,
  fetchFinding: (id: string) => Promise<FindingDetailResponse>,
): Promise<FindingLoadOutcome> {
  try {
    const detail = await fetchFinding(findingId);
    return { ok: true, evidence: detail.evidence, replay: detail.replay };
  } catch {
    return { ok: false, error: FINDING_LOAD_FAILED_TEXT };
  }
}

export type StartFailureOutcome = {
  startErrorCode: string | null;
  terminal: TerminalStatus | null;
  streamEnded: boolean;
  error: string;
  /** RB-023: a failed start never shows an earlier run's usage. */
  usage: null;
};

/** A failed POST: only `code: "start_error"` is a campaign status; anything else is a request failure. */
export function startFailure(err: unknown): StartFailureOutcome {
  if (err instanceof ApiError && err.code === "start_error") {
    return {
      startErrorCode: err.code,
      terminal: { status: err.status ?? "failed", outcome: err.outcome ?? "error" },
      streamEnded: true,
      error: `Failed to start${err.campaignId ? ` (campaign ${err.campaignId})` : ""}.`,
      usage: null,
    };
  }
  return {
    startErrorCode: null,
    terminal: null,
    streamEnded: false,
    error: requestFailureText(err),
    usage: null,
  };
}
