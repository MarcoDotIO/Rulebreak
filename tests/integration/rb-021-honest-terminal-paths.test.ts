import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CampaignEvent } from "@rulebreak/contracts";

// RB-021: each tested throw path ends the campaign failed / error (never running or clean), the
// half-recorded action is closed out, and a throw while constructing the runner returns the
// start_error body Wizard pinned. The target is wrapped so a test can make execute() throw;
// everything else is real.
const control = vi.hoisted(() => ({ targetThrowAt: 0, executes: 0 }));

vi.mock("@rulebreak/economy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@rulebreak/economy")>();
  return {
    ...actual,
    createSyntheticTargetAdapter: (...args: Parameters<typeof actual.createSyntheticTargetAdapter>) => {
      const real = actual.createSyntheticTargetAdapter(...args);
      return new Proxy(real, {
        get(target, prop, receiver) {
          if (prop === "execute") {
            return (envelope: unknown) => {
              control.executes += 1;
              if (control.targetThrowAt > 0 && control.executes === control.targetThrowAt) throw new Error("rb-021 injected target throw");
              return target.execute(envelope);
            };
          }
          const value = Reflect.get(target, prop, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
  };
});

process.env.RULEBREAK_OPERATOR_TOKEN = "rb021-test-operator-token";
process.env.RULEBREAK_DATA_DIR = mkdtempSync(join(tmpdir(), "rb021-server-"));

const { ScriptedCampaignRunner, knownTradeFailureSteps } = await import("@rulebreak/campaign");
const { EvidenceStore } = await import("@rulebreak/evidence");
const { app } = await import("../../apps/server/src/index.js");

afterEach(() => {
  control.targetThrowAt = 0;
  control.executes = 0;
  vi.restoreAllMocks();
});

const tempDb = () => join(mkdtempSync(join(tmpdir(), "rb021-")), "campaign.sqlite");
const HEADERS = { "content-type": "application/json", "x-rulebreak-operator-token": "rb021-test-operator-token" };

function danglingSubmissions(events: CampaignEvent[]): string[] {
  return events.flatMap((e, i) => {
    if (e.type !== "action_submitted") return [];
    const next = events[i + 1];
    const closed =
      (next?.type === "action_completed" && next.payload.logicalActionId === e.payload.logicalActionId) ||
      (next?.type === "system_error" && next.payload.logicalActionId === e.payload.logicalActionId);
    return closed ? [] : [e.payload.logicalActionId];
  });
}

function expectFailedRecord(store: InstanceType<typeof EvidenceStore>, id: string, code: string, actions: number) {
  expect([store.getCampaign(id)?.status, store.getCampaignOutcome(id)]).toEqual(["failed", "error"]);
  expect(store.listActions(id)).toHaveLength(actions);
  const events = store.listEvents(id);
  expect(danglingSubmissions(events)).toEqual([]);
  const errors = events.filter((e) => e.type === "system_error");
  expect(errors.map((e) => e.type === "system_error" && e.payload.code)).toEqual([code]);
  expect(events.at(-1)).toMatchObject({ type: "campaign_state", payload: { status: "failed" } });
  const sequences = events.map((e) => e.sequence);
  expect(new Set(sequences).size).toBe(sequences.length);
  return errors[0]!;
}

function storeThrowOnCall(method: "persistAcceptedAction" | "appendEvent" | "createCampaign", call: number) {
  const original = EvidenceStore.prototype[method] as (...a: unknown[]) => unknown;
  let calls = 0;
  vi.spyOn(EvidenceStore.prototype, method).mockImplementation(function (this: unknown, ...args: unknown[]) {
    calls += 1;
    if (calls === call) throw new Error(`rb-021 injected ${method} throw`);
    return original.apply(this, args);
  } as never);
}

describe("RB-021 standalone ScriptedCampaignRunner: the tested throw paths end failed / error", () => {
  const runner = (id: string, steps = knownTradeFailureSteps()) =>
    new ScriptedCampaignRunner({ campaignId: id, dbPath: tempDb(), fixtureMode: "faulty", steps });

  it("store throw on the second action: run_error closes out action-2, one action kept, rethrown", () => {
    const r = runner("camp-rb021-store");
    storeThrowOnCall("persistAcceptedAction", 2);
    expect(() => r.run()).toThrow("rb-021 injected persistAcceptedAction throw");
    vi.restoreAllMocks();
    const error = expectFailedRecord(r.store, "camp-rb021-store", "run_error", 1);
    expect(error.type === "system_error" && error.payload).toMatchObject({ logicalActionId: "action-2", message: "run threw (Error) on action-2" });
  });

  it("target throw on the second action: run_error closes out action-2, one action kept, rethrown", () => {
    const r = runner("camp-rb021-target");
    control.targetThrowAt = 2;
    expect(() => r.run()).toThrow("rb-021 injected target throw");
    const error = expectFailedRecord(r.store, "camp-rb021-target", "run_error", 1);
    expect(error.type === "system_error" && error.payload.logicalActionId).toBe("action-2");
    expect(() => r.retryDispatch({} as never)).toThrow("campaign is not admitting new actions");
  });

  it("malformed envelope: the target refuses it and the verifier's boundary parse throws, so verifier_error (never clean)", () => {
    const steps = [knownTradeFailureSteps()[0]!, { actorId: "player-a", kind: "not_a_tool", params: {} } as never];
    const r = runner("camp-rb021-envelope", steps);
    expect(() => r.run()).toThrow();
    const error = expectFailedRecord(r.store, "camp-rb021-envelope", "verifier_error", 1);
    expect(error.type === "system_error" && error.payload.logicalActionId).toBe("action-2");
  });

  it("replay or export throw after the run (recordFailure): replay_error, the finding keeps its status, no-op when repeated", () => {
    const r = runner("camp-rb021-replay");
    expect(r.run().outcome).toBe("violation_candidate");
    // A caller (like the control API) appends its own event first; sequence numbers must not collide.
    const store = r.store;
    const next = store.listEvents("camp-rb021-replay").length + 1;
    store.appendEvent({ schemaVersion: 1, eventId: "event-rb021-external", campaignId: "camp-rb021-replay", sequence: next, timestamp: new Date().toISOString(), mode: "recorded", type: "budget_update", payload: {} });
    r.recordFailure("replay_error", "replay threw after the run");
    r.recordFailure("run_error", "second call is a no-op");
    expectFailedRecord(store, "camp-rb021-replay", "replay_error", 3);
    expect(store.getFinding("camp-rb021-replay")?.status).toBe("candidate");
  });

  it("constructor throw after the campaign row was written: the row ends failed / error, nothing left running", () => {
    const dbPath = tempDb();
    storeThrowOnCall("appendEvent", 1); // the initial campaign_state event, right after createCampaign
    expect(() => new ScriptedCampaignRunner({ campaignId: "camp-rb021-ctor", dbPath, fixtureMode: "faulty", steps: knownTradeFailureSteps() })).toThrow(
      "rb-021 injected appendEvent throw",
    );
    vi.restoreAllMocks();
    const store = new EvidenceStore(dbPath);
    expect([store.getCampaign("camp-rb021-ctor")?.status, store.getCampaignOutcome("camp-rb021-ctor")]).toEqual(["failed", "error"]);
    const events = store.listEvents("camp-rb021-ctor");
    expect(events.map((e) => (e.type === "system_error" ? e.payload.code : e.type))).toEqual(["start_error", "campaign_state"]);
  });
});

async function api(campaignId: string) {
  const post = await app.inject({ method: "POST", url: "/api/campaigns", headers: HEADERS, payload: { fixtureMode: "faulty", campaignId } });
  const get = await app.inject({ method: "GET", url: `/api/campaigns/${encodeURIComponent(campaignId)}` });
  const stream = await app.inject({ method: "GET", url: `/api/campaigns/${encodeURIComponent(campaignId)}/events` });
  return { post, get, stream };
}

function doneOf(body: string): Record<string, unknown> | null {
  const block = body.split("\n\n").find((b) => b.startsWith("event: done"));
  const data = block ? /^data: (.+)$/m.exec(block)?.[1] : undefined;
  return data ? (JSON.parse(data) as Record<string, unknown>) : null;
}

describe("RB-021 control API", () => {
  it("target throw during the run: POST, GET and done agree on failed / error with run_error", async () => {
    control.targetThrowAt = 2;
    const { post, get, stream } = await api("camp-rb021-api-target");
    expect([post.statusCode, get.statusCode, stream.statusCode]).toEqual([200, 200, 200]);
    const g = get.json() as { status: string; outcome: string; campaign: { status: string } };
    expect([g.status, g.outcome, g.campaign.status]).toEqual(["failed", "error", "failed"]);
    expect(post.json()).toMatchObject({ status: "failed", outcome: "error" });
    expect(doneOf(stream.body)).toEqual({ ok: true, campaignId: "camp-rb021-api-target", status: "failed", outcome: "error" });
    expect(stream.body).toContain('"code":"run_error"');
  });

  it("constructor throw before any row: the exact start_error body, no raw exception text, no session, 404 campaign_not_found", async () => {
    const id = "camp-rb021-api-norow";
    storeThrowOnCall("createCampaign", 1);
    const { post, get, stream } = await api(id);
    vi.restoreAllMocks();
    expect(post.statusCode).toBe(500);
    expect(post.json()).toEqual({ error: "campaign could not be started", code: "start_error", campaignId: id, status: "failed", outcome: "error" });
    expect(post.body).not.toContain("injected");
    expect(get.statusCode).toBe(404);
    expect(get.json()).toMatchObject({ code: "campaign_not_found" });
    expect(typeof (get.json() as { error: unknown }).error).toBe("string");
    expect(stream.statusCode).toBe(404);
    expect(stream.json()).toMatchObject({ code: "campaign_not_found" });
  });

  it("constructor throw after the row was written: start_error body, no session, and the stored row is failed / error", async () => {
    storeThrowOnCall("appendEvent", 1);
    const { post, get } = await api("camp-rb021-api-ctor");
    vi.restoreAllMocks();
    expect(post.statusCode).toBe(500);
    expect(post.json()).toEqual({ error: "campaign could not be started", code: "start_error", campaignId: "camp-rb021-api-ctor", status: "failed", outcome: "error" });
    expect([get.statusCode, (get.json() as { code: string }).code]).toEqual([404, "campaign_not_found"]);
    const store = new EvidenceStore(join(process.env.RULEBREAK_DATA_DIR!, "campaigns", "camp-rb021-api-ctor.sqlite"));
    expect([store.getCampaign("camp-rb021-api-ctor")?.status, store.getCampaignOutcome("camp-rb021-api-ctor")]).toEqual(["failed", "error"]);
  });

  it("an over-long campaign id (schema throw inside the constructor) also returns the exact start_error body", async () => {
    const id = "x".repeat(129);
    const post = await app.inject({ method: "POST", url: "/api/campaigns", headers: HEADERS, payload: { fixtureMode: "faulty", campaignId: id } });
    expect(post.statusCode).toBe(500);
    expect(post.json()).toEqual({ error: "campaign could not be started", code: "start_error", campaignId: id, status: "failed", outcome: "error" });
    expect(post.body).not.toMatch(/ZodError|too_big|String must/);
  });

  it("a repeated campaign id answers 409 with code campaign_exists", async () => {
    await api("camp-rb021-api-dup");
    const again = await app.inject({ method: "POST", url: "/api/campaigns", headers: HEADERS, payload: { fixtureMode: "faulty", campaignId: "camp-rb021-api-dup" } });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: "campaign exists", code: "campaign_exists" });
  });
});
