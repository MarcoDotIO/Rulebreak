import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("G4-P5 operator HTTP enforcement", () => {
  const prevToken = process.env.RULEBREAK_OPERATOR_TOKEN;
  const prevData = process.env.RULEBREAK_DATA_DIR;

  afterEach(() => {
    if (prevToken === undefined) delete process.env.RULEBREAK_OPERATOR_TOKEN;
    else process.env.RULEBREAK_OPERATOR_TOKEN = prevToken;
    if (prevData === undefined) delete process.env.RULEBREAK_DATA_DIR;
    else process.env.RULEBREAK_DATA_DIR = prevData;
    // Drop cached module so next import sees new env.
    // Vitest keeps ESM cache — re-import via query not available; set env before dynamic import each time with unique data dir only.
  });

  it("rejects mutation without token when operator token is configured", async () => {
    process.env.RULEBREAK_OPERATOR_TOKEN = "test-operator-token";
    process.env.RULEBREAK_DATA_DIR = mkdtempSync(join(tmpdir(), "rb-op-"));
    const { app } = await import("../../apps/server/src/index.js");
    const res = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: { "content-type": "application/json" },
      payload: { fixtureMode: "faulty" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: "unauthorized operator" });
  });

  it("allows mutation with matching operator token", async () => {
    process.env.RULEBREAK_OPERATOR_TOKEN = "test-operator-token";
    process.env.RULEBREAK_DATA_DIR = mkdtempSync(join(tmpdir(), "rb-op-ok-"));
    const { app } = await import("../../apps/server/src/index.js");
    const res = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: {
        "content-type": "application/json",
        "x-rulebreak-operator-token": "test-operator-token",
      },
      payload: { fixtureMode: "faulty", campaignId: "camp-op-token-ok" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { finding?: { status?: string }; outcome?: string };
    expect(body.finding?.status).toBe("confirmed");
    expect(body.outcome).toBe("violation_confirmed");
  });

  it("returns 503 when operator token is not configured", async () => {
    delete process.env.RULEBREAK_OPERATOR_TOKEN;
    process.env.RULEBREAK_DATA_DIR = mkdtempSync(join(tmpdir(), "rb-op-503-"));
    // Fresh import won't reload env already baked into module if already loaded.
    // configuredOperatorToken reads process.env at request time — OK.
    const { app } = await import("../../apps/server/src/index.js");
    const res = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: { "content-type": "application/json" },
      payload: { fixtureMode: "faulty" },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: "operator token not configured" });
  });
});
