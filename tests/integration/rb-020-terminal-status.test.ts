import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CampaignEvent } from "@rulebreak/contracts";

// RB-020: a verifier (or replay) throw ends the campaign failed / error, closes out the
// half-recorded action, and the closing SSE `done` event and the GET refetch carry the same
// status and outcome. The verifier is wrapped so a test can make verifyTransition throw;
// every other export is the real one.
const control = vi.hoisted(() => ({ mode: "off" as "off" | "loop" | "replay", fromCall: 0, calls: 0 }));

vi.mock("@rulebreak/verifier", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@rulebreak/verifier")>();
  return {
    ...actual,
    verifyTransition: (...args: Parameters<typeof actual.verifyTransition>) => {
      const isReplay = args[0].envelope.campaignId.startsWith("replay-");
      if (control.mode === "loop" && !isReplay) {
        control.calls += 1;
        if (control.calls >= control.fromCall) throw new Error("rb-020 injected verifier throw");
      }
      if (control.mode === "replay" && isReplay) throw new Error("rb-020 injected replay verifier throw");
      return actual.verifyTransition(...args);
    },
  };
});

process.env.RULEBREAK_OPERATOR_TOKEN = "rb020-test-operator-token";
process.env.RULEBREAK_DATA_DIR = mkdtempSync(join(tmpdir(), "rb020-server-"));

const { ScriptedCampaignRunner, knownTradeFailureSteps, runKnownFaultyScript } = await import("@rulebreak/campaign");
const { EvidenceStore } = await import("@rulebreak/evidence");
const { app } = await import("../../apps/server/src/index.js");

function inject(mode: typeof control.mode, fromCall = 0): void {
  control.mode = mode;
  control.fromCall = fromCall;
  control.calls = 0;
}
afterEach(() => inject("off"));

const tempDb = () => join(mkdtempSync(join(tmpdir(), "rb020-")), "campaign.sqlite");

/** Every action_submitted is closed out by its action_completed or by a system_error naming it. */
function danglingSubmissions(events: CampaignEvent[]): string[] {
  const out: string[] = [];
  events.forEach((e, i) => {
    if (e.type !== "action_submitted") return;
    const next = events[i + 1];
    const closed =
      (next?.type === "action_completed" && next.payload.logicalActionId === e.payload.logicalActionId) ||
      (next?.type === "system_error" && next.payload.logicalActionId === e.payload.logicalActionId);
    if (!closed) out.push(e.payload.logicalActionId);
  });
  return out;
}

const HEADERS = { "content-type": "application/json", "x-rulebreak-operator-token": "rb020-test-operator-token" };

type Sse = { campaign: CampaignEvent[]; done: Record<string, unknown> | null; doneCount: number };
function parseSse(body: string): Sse {
  const out: Sse = { campaign: [], done: null, doneCount: 0 };
  for (const block of body.split("\n\n")) {
    const name = /^event: (.+)$/m.exec(block)?.[1];
    const data = /^data: (.+)$/m.exec(block)?.[1];
    if (!name || !data) continue;
    if (name === "campaign") out.campaign.push(JSON.parse(data) as CampaignEvent);
    if (name === "done") {
      out.done = JSON.parse(data) as Record<string, unknown>;
      out.doneCount += 1;
    }
  }
  return out;
}

async function runViaApi(campaignId: string, fixtureMode: "fixed" | "faulty" = "faulty") {
  const post = await app.inject({ method: "POST", url: "/api/campaigns", headers: HEADERS, payload: { fixtureMode, campaignId } });
  const get = await app.inject({ method: "GET", url: `/api/campaigns/${campaignId}` });
  const sse = await app.inject({ method: "GET", url: `/api/campaigns/${campaignId}/events` });
  return { post, get, sse: parseSse(sse.body) };
}

describe("RB-020 scripted runner: a verifier throw ends the campaign failed / error", () => {
  it("ScriptedCampaignRunner.run and runKnownFaultyScript: failed / error, partial actions kept, no dangling action", () => {
    inject("loop", 2);
    const runner = new ScriptedCampaignRunner({ campaignId: "camp-rb020-runner", dbPath: tempDb(), fixtureMode: "faulty", steps: knownTradeFailureSteps() });
    // The caller still sees the throw (RB-019 pins this); the record is what changes.
    expect(() => runner.run()).toThrow("rb-020 injected verifier throw");
    const store = runner.store;
    expect(store.getCampaign("camp-rb020-runner")?.status).toBe("failed");
    expect(store.getCampaignOutcome("camp-rb020-runner")).toBe("error");
    expect(store.listActions("camp-rb020-runner")).toHaveLength(1); // the one action before the throw
    const events = store.listEvents("camp-rb020-runner");
    expect(danglingSubmissions(events)).toEqual([]);
    const error = events.find((e) => e.type === "system_error");
    expect(error?.type === "system_error" && error.payload).toMatchObject({ code: "verifier_error", logicalActionId: expect.any(String) });
    expect(events.at(-1)).toMatchObject({ type: "campaign_state", payload: { status: "failed" } });
    // Frozen: no further actions are admitted.
    expect(() => runner.retryDispatch({} as never)).toThrow("campaign is not admitting new actions");

    inject("loop", 1);
    const dbPath = tempDb();
    expect(() => runKnownFaultyScript(dbPath, "camp-rb020-known")).toThrow("rb-020 injected verifier throw");
    const reopened = new EvidenceStore(dbPath);
    expect([reopened.getCampaign("camp-rb020-known")?.status, reopened.getCampaignOutcome("camp-rb020-known")]).toEqual(["failed", "error"]);
    expect(reopened.listActions("camp-rb020-known")).toHaveLength(0);
  });
});

describe("RB-020 control API: terminal status in POST, GET and the closing SSE event", () => {
  it("loop throw: failed / error, session registered, GET and done agree", async () => {
    inject("loop", 2);
    const { post, get, sse } = await runViaApi("camp-rb020-api-loop");
    expect(post.statusCode).toBe(200);
    expect(get.statusCode).toBe(200);
    const g = get.json() as { status: string; outcome: string; campaign: { status: string }; finding: unknown };
    expect([g.status, g.outcome, g.campaign.status]).toEqual(["failed", "error", "failed"]);
    expect(post.json()).toMatchObject({ status: "failed", outcome: "error" });
    expect(g.finding).toBeNull();
    expect(sse.doneCount).toBe(1);
    expect(sse.done).toEqual({ ok: true, campaignId: "camp-rb020-api-loop", status: g.status, outcome: g.outcome });
    expect(danglingSubmissions(sse.campaign)).toEqual([]);
    expect(sse.campaign.some((e) => e.type === "system_error" && e.payload.code === "verifier_error")).toBe(true);
  });

  it("replay throw: failed / error, finding stays candidate, GET and done agree", async () => {
    inject("replay");
    const { post, get, sse } = await runViaApi("camp-rb020-api-replay");
    expect(post.statusCode).toBe(200);
    expect(get.statusCode).toBe(200);
    const g = get.json() as { status: string; outcome: string; campaign: { status: string }; finding: { status: string } | null };
    expect([g.status, g.outcome, g.campaign.status]).toEqual(["failed", "error", "failed"]);
    expect(g.finding?.status).toBe("candidate");
    expect(post.json()).toMatchObject({ status: "failed", outcome: "error" });
    expect(sse.done).toEqual({ ok: true, campaignId: "camp-rb020-api-replay", status: g.status, outcome: g.outcome });
    expect(danglingSubmissions(sse.campaign)).toEqual([]);
    expect(sse.campaign.some((e) => e.type === "system_error" && e.payload.code === "replay_error")).toBe(true);
    expect(sse.campaign.at(-1)).toMatchObject({ type: "campaign_state", payload: { status: "failed" } });
  });

  it("non-verifier throw during the run (the store fails on the second action): failed / error, run_error, GET and done agree", async () => {
    const original = EvidenceStore.prototype.persistAcceptedAction;
    let calls = 0;
    const spy = vi.spyOn(EvidenceStore.prototype, "persistAcceptedAction").mockImplementation(function (this: InstanceType<typeof EvidenceStore>, ...args) {
      calls += 1;
      if (calls === 2) throw new Error("rb-020 injected store throw");
      return original.apply(this, args);
    });
    try {
      const { post, get, sse } = await runViaApi("camp-rb020-api-store");
      expect(calls).toBe(2);
      expect(post.statusCode).toBe(200);
      expect(get.statusCode).toBe(200);
      const g = get.json() as { status: string; outcome: string; campaign: { status: string }; finding: unknown };
      expect([g.status, g.outcome, g.campaign.status]).toEqual(["failed", "error", "failed"]);
      expect(post.json()).toMatchObject({ status: "failed", outcome: "error" });
      expect(g.finding).toBeNull();
      expect(sse.done).toEqual({ ok: true, campaignId: "camp-rb020-api-store", status: g.status, outcome: g.outcome });
      expect(danglingSubmissions(sse.campaign)).toEqual([]);
      const error = sse.campaign.find((e) => e.type === "system_error");
      expect(error?.type === "system_error" && error.payload).toMatchObject({ code: "run_error", logicalActionId: expect.any(String) });
      expect(sse.campaign.some((e) => e.type === "system_error" && e.payload.code === "verifier_error")).toBe(false);
      expect(sse.campaign.at(-1)).toMatchObject({ type: "campaign_state", payload: { status: "failed" } });
    } finally {
      spy.mockRestore();
    }
  });

  it("no throw: the same fields carry the clean results (faulty -> violation_confirmed, fixed -> no_violation_observed)", async () => {
    for (const [mode, id, outcome] of [
      ["faulty", "camp-rb020-api-faulty", "violation_confirmed"],
      ["fixed", "camp-rb020-api-fixed", "no_violation_observed"],
    ] as const) {
      const { post, get, sse } = await runViaApi(id, mode);
      const g = get.json() as { status: string; outcome: string; campaign: { status: string } };
      expect([g.status, g.outcome, g.campaign.status]).toEqual(["completed", outcome, "completed"]);
      expect(post.json()).toMatchObject({ status: "completed", outcome });
      expect(sse.done).toEqual({ ok: true, campaignId: id, status: "completed", outcome });
      expect(danglingSubmissions(sse.campaign)).toEqual([]);
    }
  });
});
