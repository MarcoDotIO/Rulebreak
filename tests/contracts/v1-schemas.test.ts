import { describe, expect, it } from "vitest";
import {
  APPROVED_RULE_PACK_V1,
  ActionEnvelopeSchema,
  CampaignEventSchema,
  DEFAULT_INITIAL_WORLD,
  FindingSchema,
  P0_INVARIANTS,
  TargetManifestSchema,
  WorldStateSchema,
  parseExplorerToolArgs,
} from "@rulebreak/contracts";

describe("RB-005 domain contracts v1", () => {
  it("exports default initial world per AC-01", () => {
    expect(DEFAULT_INITIAL_WORLD).toEqual({
      schemaVersion: 1,
      players: ["player-a", "player-b"],
      startingCurrency: 100,
      uniqueItemId: "relic-001",
      ownerId: "player-a",
      seed: "rulebreak-v0-default",
    });
  });

  it("freezes P0 rule pack to INV-001..005", () => {
    expect(APPROVED_RULE_PACK_V1.invariantIds).toEqual([...P0_INVARIANTS]);
    expect(APPROVED_RULE_PACK_V1.invariantIds).not.toContain("INV-006");
  });

  it("rejects explorer authority fields on MCP args", () => {
    const spoof = parseExplorerToolArgs("economy_observe", { actorId: "intruder" });
    expect(spoof.ok).toBe(false);
    if (!spoof.ok) expect(spoof.error).toContain("actorId");

    const path = parseExplorerToolArgs("trade_create", {
      itemId: "relic-001",
      counterpartyId: "player-b",
      price: 10,
      filePath: "/etc/passwd",
    });
    expect(path.ok).toBe(false);
  });

  it("accepts strict trade_create params", () => {
    const ok = parseExplorerToolArgs("trade_create", {
      itemId: "relic-001",
      counterpartyId: "player-b",
      price: 25,
    });
    expect(ok).toEqual({
      ok: true,
      params: { itemId: "relic-001", counterpartyId: "player-b", price: 25 },
    });
  });

  it("validates action envelopes with trusted actor binding", () => {
    const env = ActionEnvelopeSchema.parse({
      schemaVersion: 1,
      campaignId: "camp-1",
      worldId: "world-1",
      actorId: "player-a",
      logicalActionId: "act-1",
      transportDispatchId: "disp-1",
      kind: "trade_create",
      params: { itemId: "relic-001", counterpartyId: "player-b", price: 10 },
    });
    expect(env.actorId).toBe("player-a");
  });

  it("rejects fractional currency in world state", () => {
    const bad = WorldStateSchema.safeParse({
      schemaVersion: 1,
      balances: { "player-a": 10.5, "player-b": 100 },
      itemOccurrences: [
        { itemId: "relic-001", location: { kind: "player", playerId: "player-a" } },
      ],
      trades: [],
      nextTradeSeq: 0,
      virtualClock: 0,
      seed: "s",
    });
    expect(bad.success).toBe(false);
  });

  it("validates finding + target + campaign event shapes", () => {
    const target = TargetManifestSchema.parse({
      schemaVersion: 1,
      targetId: "synth-trade-fixed",
      displayName: "Synthetic trade (fixed)",
      fixtureMode: "fixed",
      buildId: "local-dev",
      publicContractVersion: 1,
    });
    expect(target.fixtureMode).toBe("fixed");

    const finding = FindingSchema.parse({
      schemaVersion: 1,
      findingId: "f-1",
      campaignId: "camp-1",
      status: "candidate",
      mode: "scripted",
      violation: {
        schemaVersion: 1,
        invariantId: "INV-003",
        logicalActionId: "act-9",
        sequence: 9,
        message: "unique item in two locations",
        preStateHash: "h0",
        postStateHash: "h1",
      },
      targetId: "synth-trade-faulty",
      rulePackVersion: "1.0.0",
    });
    expect(finding.status).toBe("candidate");

    const event = CampaignEventSchema.parse({
      schemaVersion: 1,
      eventId: "e-1",
      campaignId: "camp-1",
      sequence: 1,
      timestamp: "2026-09-15T21:00:00.000Z",
      mode: "scripted",
      type: "campaign_state",
      payload: { status: "running" },
    });
    expect(event.type).toBe("campaign_state");
  });
});
