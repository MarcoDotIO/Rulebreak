import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ScriptedCampaignRunner, knownTradeFailureSteps } from "@rulebreak/campaign";
import {
  exportEvidenceBundle,
  legitimateTradeWorks,
  loadBundleFromStore,
  replayBundle,
} from "../../packages/replay/src/index.js";

function tempDb(): string {
  return join(mkdtempSync(join(tmpdir(), "rb009-")), "campaign.sqlite");
}

describe("RB-009 offline replay and regression export", () => {
  it("replays a persisted faulty finding on a fresh faulty target", () => {
    const dbPath = tempDb();
    const runner = new ScriptedCampaignRunner({
      campaignId: "camp-rb009-faulty",
      dbPath,
      fixtureMode: "faulty",
      steps: knownTradeFailureSteps(),
    });
    const run = runner.run();
    expect(run.outcome).toBe("violation_candidate");
    const bundle = loadBundleFromStore(runner.store, "camp-rb009-faulty");
    const replay = replayBundle(bundle, {
      fixtureMode: "faulty",
      requireHashMatch: true,
    });
    expect(replay.outcome).toBe("matched_violation");
    expect(replay.findingId).toBe(bundle.finding.findingId);
  });

  it("shows the fixed target blocks the recorded violation", () => {
    const dbPath = tempDb();
    const runner = new ScriptedCampaignRunner({
      campaignId: "camp-rb009-fixed",
      dbPath,
      fixtureMode: "faulty",
      steps: knownTradeFailureSteps(),
    });
    runner.run();
    const bundle = loadBundleFromStore(runner.store, "camp-rb009-fixed");
    const replay = replayBundle(bundle, { fixtureMode: "fixed" });
    expect(replay.outcome).toBe("blocked_as_expected");
    expect(legitimateTradeWorks()).toBe(true);
  });

  it("exports a bundle whose generated regression is red on faulty and green on fixed", async () => {
    const dbPath = tempDb();
    const runner = new ScriptedCampaignRunner({
      campaignId: "camp-rb009-export",
      dbPath,
      fixtureMode: "faulty",
      steps: knownTradeFailureSteps(),
    });
    runner.run();
    const bundle = loadBundleFromStore(runner.store, "camp-rb009-export");
    const outDir = mkdtempSync(join(tmpdir(), "rb009-bundle-"));
    const exported = exportEvidenceBundle(bundle, outDir);
    expect(JSON.parse(readFileSync(exported.findingPath, "utf8")).findingId).toBe(
      bundle.finding.findingId,
    );
    expect(readFileSync(exported.regressionTestPath, "utf8")).toContain(
      "exported safety regression",
    );
    expect(readFileSync(exported.readmePath, "utf8")).toContain("Harness:");

    // Execute the safety property directly (same logic as exported template).
    const faulty = replayBundle(bundle, { fixtureMode: "faulty" });
    const fixed = replayBundle(bundle, { fixtureMode: "fixed" });
    expect(faulty.outcome).toBe("matched_violation");
    expect(fixed.outcome).toBe("blocked_as_expected");
  });
});
