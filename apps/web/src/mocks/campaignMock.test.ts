import { describe, expect, it } from "vitest";
import {
  CampaignEventSchema,
  CampaignSchema,
  FindingSchema,
  FindingStatusSchema,
  ProvenanceModeSchema,
  ReplayResultSchema,
  TargetManifestSchema,
  UsageLedgerSchema,
} from "@rulebreak/contracts";
import {
  mockCampaign,
  mockEvents,
  mockFinding,
  mockReplay,
  mockTarget,
  mockUsage,
} from "./campaignMock.js";

describe("RB-010 schema-valid UI mocks", () => {
  it("parses mock campaign with frozen CampaignSchema", () => {
    const campaign = CampaignSchema.parse(mockCampaign);
    expect(campaign.mode).toBe("scripted");
    expect(ProvenanceModeSchema.parse(campaign.mode)).toBe("scripted");
    expect(campaign.status).toBe("stopped");
  });

  it("parses mock events with CampaignEventSchema", () => {
    expect(mockEvents.length).toBeGreaterThan(0);
    for (const event of mockEvents) {
      const parsed = CampaignEventSchema.parse(event);
      expect(parsed.campaignId).toBe(mockCampaign.campaignId);
      expect(ProvenanceModeSchema.parse(parsed.mode)).toBe("scripted");
    }
    const types = new Set(mockEvents.map((e) => e.type));
    expect(types.has("action_submitted")).toBe(true);
    expect(types.has("action_completed")).toBe(true);
    expect(types.has("rule_violation")).toBe(true);
  });

  it("parses mock finding with exact FindingStatus enum", () => {
    const finding = FindingSchema.parse(mockFinding);
    expect(FindingStatusSchema.parse(finding.status)).toBe("confirmed");
    expect(finding.violation.invariantId).toBe("INV-003");
    expect(finding.mode).toBe("scripted");
  });

  it("parses mock replay with ReplayResultSchema outcomes", () => {
    const replay = ReplayResultSchema.parse(mockReplay);
    expect(replay.outcome).toBe("matched_violation");
    expect(["matched_violation", "diverged", "blocked_as_expected", "error"]).toContain(
      replay.outcome,
    );
  });

  it("parses mock target and usage ledger", () => {
    expect(TargetManifestSchema.parse(mockTarget).fixtureMode).toBe("faulty");
    expect(UsageLedgerSchema.parse(mockUsage).campaignId).toBe(
      mockCampaign.campaignId,
    );
  });
});
