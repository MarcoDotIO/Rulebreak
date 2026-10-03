import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { OPERATOR_ERROR_CODES, OPERATOR_TOKEN_HEADER } from "../../apps/server/src/operator-auth.js";

// RB-026: the operator 503 and 401 carry a typed `code`, statuses are unchanged,
// and no response body or header ever carries the configured or the sent token.
const CONFIGURED = "rb026-configured-operator-token";
const WRONG = "rb026-wrong-operator-token";

const UNSET_BODY = {
  error: "operator token not configured",
  code: "operator_token_unset",
  hint: "Set RULEBREAK_OPERATOR_TOKEN for control API mutations",
};
const INVALID_BODY = { error: "unauthorized operator", code: "operator_token_invalid" };

const ROUTES = [
  { url: "/api/campaigns", payload: { fixtureMode: "faulty" } },
  { url: "/api/campaigns/camp-rb026-none/stop", payload: {} },
] as const;

let app: FastifyInstance;
const prevToken = process.env.RULEBREAK_OPERATOR_TOKEN;

beforeAll(async () => {
  process.env.RULEBREAK_DATA_DIR = mkdtempSync(join(tmpdir(), "rb-026-"));
  ({ app } = await import("../../apps/server/src/index.js"));
});

afterEach(() => {
  if (prevToken === undefined) delete process.env.RULEBREAK_OPERATOR_TOKEN;
  else process.env.RULEBREAK_OPERATOR_TOKEN = prevToken;
});

function expectNoTokenLeak(res: { body: string; headers: Record<string, unknown> }) {
  const headers = JSON.stringify(res.headers);
  for (const secret of [CONFIGURED, WRONG]) {
    expect(res.body).not.toContain(secret);
    expect(headers).not.toContain(secret);
  }
}

describe("RB-026 operator rejection codes", () => {
  it("names exactly the two codes", () => {
    expect(OPERATOR_ERROR_CODES).toEqual({ unset: "operator_token_unset", invalid: "operator_token_invalid" });
  });

  for (const route of ROUTES) {
    for (const configured of [undefined, "", "   "]) {
      it(`503 operator_token_unset on ${route.url} when the token is ${JSON.stringify(configured)}`, async () => {
        if (configured === undefined) delete process.env.RULEBREAK_OPERATOR_TOKEN;
        else process.env.RULEBREAK_OPERATOR_TOKEN = configured;
        const res = await app.inject({
          method: "POST",
          url: route.url,
          headers: { "content-type": "application/json", [OPERATOR_TOKEN_HEADER]: WRONG },
          payload: route.payload,
        });
        expect(res.statusCode).toBe(503);
        expect(res.json()).toEqual(UNSET_BODY);
        expectNoTokenLeak(res);
      });
    }

    const cases: Array<[string, Record<string, string>]> = [
      ["no header", {}],
      ["an empty header", { [OPERATOR_TOKEN_HEADER]: "" }],
      ["a wrong token", { [OPERATOR_TOKEN_HEADER]: WRONG }],
      ["a prefix of the token", { [OPERATOR_TOKEN_HEADER]: CONFIGURED.slice(0, -1) }],
      ["the token plus a suffix", { [OPERATOR_TOKEN_HEADER]: `${CONFIGURED}x` }],
    ];
    for (const [label, headers] of cases) {
      it(`401 operator_token_invalid on ${route.url} with ${label}`, async () => {
        process.env.RULEBREAK_OPERATOR_TOKEN = CONFIGURED;
        const res = await app.inject({
          method: "POST",
          url: route.url,
          headers: { "content-type": "application/json", ...headers },
          payload: route.payload,
        });
        expect(res.statusCode).toBe(401);
        expect(res.json()).toEqual(INVALID_BODY);
        expectNoTokenLeak(res);
      });
    }
  }

  it("a matching token still passes the guard (stop on an unknown id is the route's own 404, no code)", async () => {
    process.env.RULEBREAK_OPERATOR_TOKEN = CONFIGURED;
    const res = await app.inject({
      method: "POST",
      url: ROUTES[1].url,
      headers: { "content-type": "application/json", [OPERATOR_TOKEN_HEADER]: CONFIGURED },
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "campaign not found" });
    expect(res.body).not.toContain(CONFIGURED);
  });
});
