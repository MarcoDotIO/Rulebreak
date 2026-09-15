import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ScriptedCampaignRunner, knownTradeFailureSteps } from "@rulebreak/campaign";
import {
  applyConfirmingReplay,
  statusFromConfirmingReplay,
} from "@rulebreak/evidence";
import { loadBundleFromStore, replayBundle } from "@rulebreak/replay";

function tempDb(): string {
  return join(mkdtempSync(join(tmpdir(), "rb-confirm-")), "campaign.sqlite");
}

describe("candidate→confirmed durable promotion", () => {
  it("maps confirming replay outcomes without promoting fixed controls", () => {
    expect(statusFromConfirmingReplay("matched_violation")).toBe("confirmed");
    expect(statusFromConfirmingReplay("diverged")).toBe("inconclusive");
    expect(statusFromConfirmingReplay("error")).toBe("not_reproduced");
    expect(statusFromConfirmingReplay("blocked_as_expected")).toBeNull();
  });

  it("keeps finding candidate after fixed-target control alone", () => {
    const dbPath = tempDb();
    const runner = new ScriptedCampaignRunner({
      campaignId: "camp-confirm-fixed-only",
      dbPath,
      fixtureMode: "faulty",
      steps: knownTradeFailureSteps(),
    });
    runner.run();
    const before = runner.store.getFinding("camp-confirm-fixed-only");
    expect(before?.status).toBe("candidate");

    const bundle = loadBundleFromStore(runner.store, "camp-confirm-fixed-only");
    const control = replayBundle(bundle, { fixtureMode: "fixed" });
    expect(control.outcome).toBe("blocked_as_expected");

    const after = applyConfirmingReplay(
      runner.store,
      "camp-confirm-fixed-only",
      control,
    );
    expect(after?.status).toBe("candidate");
    expect(runner.store.getFinding("camp-confirm-fixed-only")?.status).toBe(
      "candidate",
    );
  });

  it("promotes to confirmed after matched_violation on faulty target", () => {
    const dbPath = tempDb();
    const runner = new ScriptedCampaignRunner({
      campaignId: "camp-confirm-faulty",
      dbPath,
      fixtureMode: "faulty",
      steps: knownTradeFailureSteps(),
    });
    const run = runner.run();
    expect(run.outcome).toBe("violation_candidate");
    expect(run.finding?.status).toBe("candidate");

    const bundle = loadBundleFromStore(runner.store, "camp-confirm-faulty");
    const confirm = replayBundle(bundle, {
      fixtureMode: "faulty",
      requireHashMatch: true,
    });
    expect(confirm.outcome).toBe("matched_violation");

    const promoted = applyConfirmingReplay(
      runner.store,
      "camp-confirm-faulty",
      confirm,
    );
    expect(promoted?.status).toBe("confirmed");
    expect(runner.store.getFinding("camp-confirm-faulty")?.status).toBe(
      "confirmed",
    );

    // Second apply is a no-op once past candidate.
    const again = applyConfirmingReplay(
      runner.store,
      "camp-confirm-faulty",
      confirm,
    );
    expect(again?.status).toBe("confirmed");
  });
});
