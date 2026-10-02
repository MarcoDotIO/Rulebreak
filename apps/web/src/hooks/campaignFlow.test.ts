import { describe, expect, it } from "vitest";
import type { Campaign, Finding } from "@rulebreak/contracts";
import { ApiError, type CampaignDetail, type FindingDetailResponse } from "../api/client";
import { terminalView } from "../api/terminalStatus";
import {
  FINDING_LOAD_FAILED_TEXT,
  loadFindingDetail,
  refetchTerminal,
  startFailure,
} from "./campaignFlow";

const campaign = { campaignId: "c-1", status: "completed" } as unknown as Campaign;
const finding = { findingId: "f-1", status: "confirmed" } as unknown as Finding;

const detail = (status: string, outcome: string | null): CampaignDetail =>
  ({ campaign, finding, status, outcome, replay: null, usage: {}, eventCount: 3 }) as unknown as CampaignDetail;

describe("RB-022 useCampaignSession branching", () => {
  it("refetch ok: GET status/outcome win over the done payload", async () => {
    const r = await refetchTerminal(
      "c-1",
      { status: "failed", outcome: "error" },
      async () => detail("completed", "violation_confirmed"),
    );
    expect(r.refetch).toBe("ok");
    expect(r.terminal).toEqual({ status: "completed", outcome: "violation_confirmed" });
    expect(r.finding).toBe(finding);
  });

  it("refetch 404 campaign_not_found says the campaign was not found", async () => {
    const r = await refetchTerminal("c-1", null, async () => {
      throw new ApiError(404, "/api/campaigns/c-1", JSON.stringify({ error: "nf", code: "campaign_not_found" }));
    });
    expect(r.refetch).toBe("not_found");
    const v = terminalView(r.terminal, { streamEnded: true, refetch: r.refetch });
    expect(v.label).toBe("Final status unknown (campaign not found on refetch)");
    expect(v.noFindingCopy).toMatch(/not a clean result/);
  });

  it("a bare 404 with no code is a failed refetch, not 'campaign not found'", async () => {
    const r = await refetchTerminal("c-1", null, async () => {
      throw new ApiError(404, "/api/campaigns/c-1", JSON.stringify({ message: "Route not found" }));
    });
    expect(r.refetch).toBe("failed");
    expect(terminalView(r.terminal, { streamEnded: true, refetch: r.refetch }).label).toBe(
      "Final status unknown (stream closed; refetch failed)",
    );
  });

  it("refetch failing any other way stays 'refetch failed' and keeps the done payload", async () => {
    const done = { status: "failed", outcome: "error" };
    const r = await refetchTerminal("c-1", done, async () => {
      throw new ApiError(503, "/api/campaigns/c-1", "Service Unavailable");
    });
    expect(r.refetch).toBe("failed");
    expect(r.terminal).toEqual(done);
    const net = await refetchTerminal("c-1", null, async () => {
      throw new TypeError("network");
    });
    expect(net.refetch).toBe("failed");
    expect(terminalView(net.terminal, { streamEnded: true, refetch: net.refetch }).label).toBe(
      "Final status unknown (stream closed; refetch failed)",
    );
  });

  it("finding-detail load failure gives its own text and leaves the run status label alone", async () => {
    const loaded = await loadFindingDetail("f-1", async () => {
      throw new ApiError(500, "/api/findings/f-1", "boom");
    });
    expect(loaded).toEqual({ ok: false, error: FINDING_LOAD_FAILED_TEXT });
    expect(FINDING_LOAD_FAILED_TEXT).toBe("Finding details could not be loaded.");
    if (!loaded.ok) expect(loaded.error).not.toMatch(/campaign status/);
    // The run's status comes from the refetch, which the finding load does not touch.
    const v = terminalView(
      { status: "completed", outcome: "violation_confirmed" },
      { streamEnded: true, refetch: "ok", findingStatus: "confirmed" },
    );
    expect(v.label).toBe("Completed — violation confirmed by replay");
  });

  it("finding-detail success returns evidence and replay", async () => {
    const res = { evidence: { a: { before: "1", after: "2" } }, replay: null } as unknown as FindingDetailResponse;
    expect(await loadFindingDetail("f-1", async () => res)).toEqual({
      ok: true,
      evidence: res.evidence,
      replay: null,
    });
  });

  it("start failure: only code start_error becomes a campaign status", () => {
    const start = startFailure(
      new ApiError(
        500,
        "/api/campaigns",
        JSON.stringify({ error: "x", code: "start_error", campaignId: "c-9", status: "failed", outcome: "error" }),
      ),
    );
    expect(start).toEqual({
      startErrorCode: "start_error",
      terminal: { status: "failed", outcome: "error" },
      streamEnded: true,
      error: "Failed to start (campaign c-9).",
    });
    for (const err of [
      new ApiError(500, "/api/campaigns", JSON.stringify({ error: "x" })),
      new ApiError(401, "/api/campaigns", JSON.stringify({ error: "token" })),
      new ApiError(409, "/api/campaigns", JSON.stringify({ error: "x", code: "campaign_exists" })),
      new Error("network"),
    ]) {
      const f = startFailure(err);
      expect(f.startErrorCode).toBeNull();
      expect(f.terminal).toBeNull();
      expect(f.error).toMatch(/^Request failed/);
    }
  });
});
