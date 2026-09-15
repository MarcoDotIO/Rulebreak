import { describe, expect, it } from "vitest";
import { CoordinatorBridge } from "@rulebreak/campaign";

describe("G3-P2 bound MCP through worker/coordinator path", () => {
  it("round-trips economy_observe with trusted actor binding only", () => {
    const bridge = new CoordinatorBridge({
      campaignId: "camp-g3-p2",
      fixtureMode: "fixed",
    });
    const explorerA = bridge.bindExplorer("player-a");
    const explorerB = bridge.bindExplorer("player-b");

    const a = explorerA.callTool("economy_observe", {});
    const b = explorerB.callTool("economy_observe", {});
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    expect(a.actorId).toBe("player-a");
    expect(b.actorId).toBe("player-b");
    expect(a.campaignId).toBe("camp-g3-p2");
    expect(a.observation?.view.inventoryItemIds).toContain("relic-001");
    expect(b.observation?.view.inventoryItemIds).not.toContain("relic-001");
    expect(JSON.stringify(a.observation)).not.toBe(JSON.stringify(b.observation));
  });

  it("rejects explorer-supplied authority fields before domain", () => {
    const explorer = new CoordinatorBridge({
      campaignId: "camp-g3-p2-auth",
    }).bindExplorer("player-a");

    for (const bad of [
      { actorId: "player-b" },
      { campaignId: "other" },
      { filePath: "/etc/passwd" },
      { fixtureMode: "faulty" },
    ]) {
      const res = explorer.callTool("economy_observe", bad);
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error).toMatch(/authority field rejected/);
    }
  });

  it("executes a bound trade_create without explorer actorId", () => {
    const bridge = new CoordinatorBridge({
      campaignId: "camp-g3-p2-trade",
      fixtureMode: "fixed",
    });
    const explorerA = bridge.bindExplorer("player-a");
    const created = explorerA.callTool("trade_create", {
      itemId: "relic-001",
      counterpartyId: "player-b",
      price: 25,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.actorId).toBe("player-a");
    expect(created.execution?.result.outcome).toBe("accepted");
  });
});
