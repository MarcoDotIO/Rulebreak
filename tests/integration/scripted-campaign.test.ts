import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ScriptedCampaignRunner,
  knownTradeFailureSteps,
  makeEnvelope,
} from "../../packages/campaign/src/index.js";

function tempDb(): string {
  return join(mkdtempSync(join(tmpdir(), "rb008-")), "campaign.sqlite");
}

describe("RB-008 scripted durable campaign pipeline", () => {
  it("persists the known faulty sequence as a candidate finding", () => {
    const dbPath = tempDb();
    const runner = new ScriptedCampaignRunner({
      campaignId: "camp-faulty-1",
      dbPath,
      fixtureMode: "faulty",
      steps: knownTradeFailureSteps(),
    });
    const result = runner.run();
    expect(result.outcome).toBe("violation_candidate");
    expect(result.finding?.status).toBe("candidate");
    expect(result.finding?.mode).toBe("scripted");
    expect(result.finding?.violation.invariantId).toMatch(/INV-00[34]/);
    expect(result.actionCount).toBe(3);
    const events = runner.store.listEvents("camp-faulty-1");
    expect(events.some((event) => event.type === "rule_violation")).toBe(true);
    expect(events.some((event) => event.type === "action_completed")).toBe(true);
  });

  it("keeps the fixed target free of confirmed violations on the same script", () => {
    const runner = new ScriptedCampaignRunner({
      campaignId: "camp-fixed-1",
      dbPath: tempDb(),
      fixtureMode: "fixed",
      steps: knownTradeFailureSteps(),
    });
    const result = runner.run();
    expect(result.outcome).toBe("no_violation_observed");
    expect(result.finding).toBeNull();
    expect(result.actionCount).toBe(3);
  });

  it("dedupes identical transport dispatch ids without re-applying", () => {
    const runner = new ScriptedCampaignRunner({
      campaignId: "camp-dedupe-1",
      dbPath: tempDb(),
      fixtureMode: "fixed",
      steps: [],
    });
    const step = knownTradeFailureSteps()[0]!;
    const envelope = makeEnvelope("camp-dedupe-1", step, 1, "dispatch-shared");
    const first = runner.submit(envelope);
    const second = runner.retryDispatch(envelope);
    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    expect(second.result).toEqual(first.result);
    expect(runner.store.listActions("camp-dedupe-1")).toHaveLength(1);
  });

  it("rejects reused dispatch ids with a different payload", () => {
    const runner = new ScriptedCampaignRunner({
      campaignId: "camp-dedupe-2",
      dbPath: tempDb(),
      fixtureMode: "fixed",
      steps: [],
    });
    const step = knownTradeFailureSteps()[0]!;
    const envelope = makeEnvelope("camp-dedupe-2", step, 1, "dispatch-clash");
    runner.submit(envelope);
    const altered = {
      ...envelope,
      params: { ...step.params, price: 40 },
    };
    expect(() => runner.retryDispatch(altered)).toThrow(/different payload/);
  });

  it("honors stop and refuses further admissions", () => {
    const runner = new ScriptedCampaignRunner({
      campaignId: "camp-stop-1",
      dbPath: tempDb(),
      fixtureMode: "faulty",
      steps: knownTradeFailureSteps(),
      stopAfterSequence: 1,
    });
    const result = runner.run();
    expect(result.outcome).toBe("stopped");
    expect(result.actionCount).toBe(1);
    const step = knownTradeFailureSteps()[1]!;
    expect(() =>
      runner.submit(makeEnvelope("camp-stop-1", step, 2)),
    ).toThrow(/not admitting/);
  });
});
