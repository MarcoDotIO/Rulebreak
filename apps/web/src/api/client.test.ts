import { describe, expect, it } from "vitest";
import { ApiError } from "./client";

describe("RB-021 typed API errors", () => {
  it("reads the pinned start_error body", () => {
    const body = JSON.stringify({
      error: "campaign could not be started",
      code: "start_error",
      campaignId: "c-1",
      status: "failed",
      outcome: "error",
    });
    const err = new ApiError(500, "/api/campaigns", body);
    expect(err.httpStatus).toBe(500);
    expect(err.code).toBe("start_error");
    expect(err.campaignId).toBe("c-1");
    expect(err.status).toBe("failed");
    expect(err.outcome).toBe("error");
    expect(err.message).toBe("500 /api/campaigns: campaign could not be started");
  });

  it("keeps other typed codes and tolerates a non-JSON body", () => {
    const e409 = new ApiError(409, "/api/campaigns", JSON.stringify({ error: "exists", code: "campaign_exists" }));
    expect(e409.code).toBe("campaign_exists");
    expect(e409.status).toBeNull();
    const plain = new ApiError(502, "/api/campaigns", "Bad Gateway");
    expect(plain.code).toBeNull();
    expect(plain.message).toBe("502 /api/campaigns: Bad Gateway");
  });
});
