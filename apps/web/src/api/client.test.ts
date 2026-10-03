import { describe, expect, it } from "vitest";
import { ApiError, operatorFailureText, requestFailureText } from "./client";

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

  it("a non-2xx with no code (pre-RB-026 operator 401/503) is a request failure, never start_error", () => {
    for (const [status, body] of [
      [401, JSON.stringify({ error: "operator token required" })],
      [503, "Service Unavailable"],
    ] as const) {
      const err = new ApiError(status, "/api/campaigns", body);
      expect(err.code).toBeNull();
      const text = requestFailureText(err);
      expect(text).toBe(`Request failed (HTTP ${status}); no campaign status was returned.`);
      expect(text).not.toMatch(/start/i);
    }
    expect(requestFailureText(new Error("network"))).toBe(
      "Request failed; no campaign status was returned.",
    );
  });
});

// RB-026: Titan's acceptance copy, pinned as literals so a drifted constant fails here.
const UNSET =
  "The local server has no operator token set. Restart dev:server and dev:web with RULEBREAK_OPERATOR_TOKEN set; see docs/demo.md.";
const INVALID =
  "The operator token was missing or didn't match the server's. Restart dev:web with the same RULEBREAK_OPERATOR_TOKEN as dev:server; see docs/demo.md.";

describe("RB-026 operator-token codes", () => {
  // The exact bodies #102 pins on the server.
  const unset = () =>
    new ApiError(
      503,
      "/api/campaigns",
      JSON.stringify({
        error: "operator token not configured",
        code: "operator_token_unset",
        hint: "Set RULEBREAK_OPERATOR_TOKEN for control API mutations",
      }),
    );
  const invalid = () =>
    new ApiError(401, "/api/campaigns", JSON.stringify({ error: "unauthorized operator", code: "operator_token_invalid" }));

  it("503 operator_token_unset reads the unset copy", () => {
    expect(requestFailureText(unset())).toBe(UNSET);
  });

  it("401 operator_token_invalid reads the invalid copy", () => {
    expect(requestFailureText(invalid())).toBe(INVALID);
  });

  it("branches on code only, never on the HTTP status", () => {
    const swapped = new ApiError(503, "/api/campaigns", JSON.stringify({ error: "x", code: "operator_token_invalid" }));
    expect(requestFailureText(swapped)).toBe(INVALID);
    const bare401 = new ApiError(401, "/api/campaigns", JSON.stringify({ error: "unauthorized operator" }));
    expect(operatorFailureText(bare401)).toBeNull();
    expect(requestFailureText(bare401)).toBe("Request failed (HTTP 401); no campaign status was returned.");
  });

  it("an unknown code falls back to Request failed (HTTP n)", () => {
    for (const code of ["operator_token_expired", "OPERATOR_TOKEN_UNSET", "start_error_x"]) {
      const err = new ApiError(503, "/api/campaigns", JSON.stringify({ error: "x", code }));
      expect(operatorFailureText(err)).toBeNull();
      expect(requestFailureText(err)).toBe("Request failed (HTTP 503); no campaign status was returned.");
    }
    expect(operatorFailureText(new Error("network"))).toBeNull();
  });

  it("the copy is fixed text: nothing from the response body reaches the screen", () => {
    const tokenish = "tok-SHOULD-NOT-APPEAR";
    const err = new ApiError(
      401,
      "/api/campaigns",
      JSON.stringify({ error: tokenish, code: "operator_token_invalid", hint: tokenish }),
    );
    expect(requestFailureText(err)).toBe(INVALID);
    expect(requestFailureText(err)).not.toContain(tokenish);
  });
});
