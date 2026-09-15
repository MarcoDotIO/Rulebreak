import { describe, expect, it } from "vitest";
/**
 * Optional detector smoke: uses the RB-006 economy only to produce a known
 * faulty post-state, then checks the independent verifier. Corrupted-state
 * unit coverage lives in invariants.test.ts without economy imports.
 */
import { createFaultyFixtureTargetAdapter, createFixedTargetAdapter } from "../../packages/economy/src/index.js";
import { verifyTransition } from "../../packages/verifier/src/index.js";

function action(
  actorId: "player-a" | "player-b",
  kind: "trade_create" | "trade_accept" | "trade_cancel",
  params: Record<string, unknown>,
  n: number,
) {
  return {
    schemaVersion: 1 as const,
    campaignId: "campaign-rb007",
    worldId: "world-rb007",
    actorId,
    logicalActionId: `action-${n}`,
    transportDispatchId: `dispatch-${n}`,
    kind,
    params,
  };
}

describe("RB-007 detector smoke against economy fixtures", () => {
  it("flags the faulty cancel-after-accept sequence with INV-003/INV-004", () => {
    const adapter = createFaultyFixtureTargetAdapter();
    adapter.execute(action("player-a", "trade_create", { itemId: "relic-001", counterpartyId: "player-b", price: 25 }, 1));
    adapter.execute(action("player-b", "trade_accept", { tradeId: "trade-0001" }, 2));
    const third = adapter.execute(action("player-a", "trade_cancel", { tradeId: "trade-0001" }, 3));
    const outcome = verifyTransition({
      preState: third.preState,
      envelope: action("player-a", "trade_cancel", { tradeId: "trade-0001" }, 3),
      result: third.result,
      postState: third.postState,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      const ids = new Set(outcome.violations.map((v) => v.invariantId));
      expect(ids.has("INV-003") || ids.has("INV-004")).toBe(true);
    }
  });

  it("keeps the fixed target green on the same attempted sequence", () => {
    const adapter = createFixedTargetAdapter();
    adapter.execute(action("player-a", "trade_create", { itemId: "relic-001", counterpartyId: "player-b", price: 25 }, 1));
    adapter.execute(action("player-b", "trade_accept", { tradeId: "trade-0001" }, 2));
    const third = adapter.execute(action("player-a", "trade_cancel", { tradeId: "trade-0001" }, 3));
    expect(third.result.outcome).toBe("domain_rejected");
    const outcome = verifyTransition({
      preState: third.preState,
      envelope: action("player-a", "trade_cancel", { tradeId: "trade-0001" }, 3),
      result: third.result,
      postState: third.postState,
    });
    expect(outcome.ok).toBe(true);
  });
});
