import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UsageLedgerSchema } from "@rulebreak/contracts";

// RB-023: usageFor() reports only what it counts. toolCalls and mutations are counted from the
// stored action rows; tokens and costUsd are not measured on this path, so they are absent rather
// than a constant 0. Checked on both the POST response and the GET refetch.
process.env.RULEBREAK_OPERATOR_TOKEN = "rb023-test-operator-token";
process.env.RULEBREAK_DATA_DIR = mkdtempSync(join(tmpdir(), "rb023-server-"));

const { EvidenceStore } = await import("@rulebreak/evidence");
const { app } = await import("../../apps/server/src/index.js");

const HEADERS = { "content-type": "application/json", "x-rulebreak-operator-token": "rb023-test-operator-token" };

function countedFromStore(campaignId: string) {
  const store = new EvidenceStore(join(process.env.RULEBREAK_DATA_DIR!, "campaigns", `${campaignId}.sqlite`));
  try {
    const actions = store.listActions(campaignId);
    const mutations = actions.filter((row) => (JSON.parse(row.resultJson) as { outcome?: string }).outcome === "accepted").length;
    return { toolCalls: actions.length, mutations };
  } finally {
    store.close();
  }
}

// Literal per-fixture counts (EO nit 1 on #89), so a counting mistake shared by the server and
// countedFromStore() is still caught. fixed rejects one of its three actions.
const PINNED = { faulty: { toolCalls: 3, mutations: 3 }, fixed: { toolCalls: 3, mutations: 2 } } as const;

describe("RB-023 usage payload: unmeasured fields are absent, counted fields are real", () => {
  for (const fixtureMode of ["faulty", "fixed"] as const) {
    it(`${fixtureMode}: POST and GET usage carry no tokens or costUsd key, and the counts match the store`, async () => {
      const campaignId = `camp-rb023-${fixtureMode}`;
      const post = await app.inject({ method: "POST", url: "/api/campaigns", headers: HEADERS, payload: { fixtureMode, campaignId } });
      expect(post.statusCode).toBe(200);
      const get = await app.inject({ method: "GET", url: `/api/campaigns/${campaignId}` });
      expect(get.statusCode).toBe(200);

      const counted = countedFromStore(campaignId);
      expect(counted.toolCalls).toBeGreaterThan(0);
      expect(counted).toEqual(PINNED[fixtureMode]);
      for (const body of [post.json(), get.json()]) {
        const usage = body.usage as Record<string, unknown>;
        expect(Object.keys(usage).sort()).toEqual(["campaignId", "mutations", "schemaVersion", "toolCalls"]);
        expect("tokens" in usage).toBe(false);
        expect("costUsd" in usage).toBe(false);
        expect(usage).toEqual({ schemaVersion: 1, campaignId, ...counted });
        expect(UsageLedgerSchema.safeParse(usage).success).toBe(true);
      }
    });
  }
});
