import { describe, expect, it } from "vitest";
import {
  bindActor,
  createFaultyFixtureTargetAdapter,
  createFixedTargetAdapter,
  createTargetAdapter,
  type CoordinatorTargetAdapter,
} from "@rulebreak/economy";
import {
  BoundedNonNegativeIntSchema,
  BoundedPositiveIntSchema,
  MAX_CURRENCY,
  TradeCreateParamsSchema,
} from "@rulebreak/contracts";

type Kind = "trade_create" | "trade_accept" | "trade_cancel";
function action(actorId: "player-a" | "player-b", kind: Kind, params: Record<string, unknown>, n: number) {
  return {
    schemaVersion: 1 as const,
    campaignId: "campaign-rb006",
    worldId: "world-rb006",
    actorId,
    logicalActionId: `action-${n}`,
    transportDispatchId: `dispatch-${n}`,
    kind,
    params,
  };
}

function create(adapter: CoordinatorTargetAdapter) {
  return adapter.execute(action("player-a", "trade_create", { itemId: "relic-001", counterpartyId: "player-b", price: 25 }, 1));
}

function runKnownSequence(adapter: CoordinatorTargetAdapter) {
  const first = create(adapter);
  const second = adapter.execute(action("player-b", "trade_accept", { tradeId: "trade-0001" }, 2));
  const third = adapter.execute(action("player-a", "trade_cancel", { tradeId: "trade-0001" }, 3));
  return { first, second, third, final: adapter.snapshotForVerifier() };
}

describe("RB-006 deterministic trade economy", () => {
  it("starts with two players, 100 units each, and one relic occurrence", () => {
    const adapter = createTargetAdapter();
    expect(adapter.snapshotForVerifier()).toEqual({
      schemaVersion: 1,
      balances: { "player-a": 100, "player-b": 100 },
      itemOccurrences: [{ itemId: "relic-001", location: { kind: "player", playerId: "player-a" } }],
      trades: [],
      nextTradeSeq: 0,
      virtualClock: 0,
      seed: "rulebreak-v0-default",
    });
  });

  it("supports create, accept, and atomic item/currency transfer", () => {
    const adapter = createFixedTargetAdapter();
    expect(create(adapter).result).toMatchObject({ outcome: "accepted", domainCode: "TRADE_CREATED" });
    expect(adapter.snapshotForVerifier().itemOccurrences).toEqual([{ itemId: "relic-001", location: { kind: "escrow", tradeId: "trade-0001" } }]);
    expect(adapter.execute(action("player-b", "trade_accept", { tradeId: "trade-0001" }, 2)).result).toMatchObject({ outcome: "accepted", domainCode: "TRADE_ACCEPTED" });
    expect(adapter.snapshotForVerifier()).toMatchObject({
      balances: { "player-a": 125, "player-b": 75 },
      itemOccurrences: [{ itemId: "relic-001", location: { kind: "player", playerId: "player-b" } }],
      trades: [{ tradeId: "trade-0001", status: "accepted" }],
      virtualClock: 2,
    });
  });

  it("supports legitimate open-trade cancellation and keeps state single-valued", () => {
    const adapter = createFixedTargetAdapter();
    create(adapter);
    const result = adapter.execute(action("player-a", "trade_cancel", { tradeId: "trade-0001" }, 2));
    expect(result.result).toMatchObject({ outcome: "accepted", domainCode: "TRADE_CANCELLED" });
    expect(adapter.snapshotForVerifier()).toMatchObject({
      balances: { "player-a": 100, "player-b": 100 },
      itemOccurrences: [{ itemId: "relic-001", location: { kind: "player", playerId: "player-a" } }],
      trades: [{ status: "cancelled" }],
    });
  });

  it("rejects wrong actors and completed lifecycle actions without mutating state", () => {
    const adapter = createFixedTargetAdapter();
    create(adapter);
    const wrongAccept = adapter.execute(action("player-a", "trade_accept", { tradeId: "trade-0001" }, 2));
    expect(wrongAccept.result).toMatchObject({ outcome: "domain_rejected", domainCode: "NOT_COUNTERPARTY" });
    expect(wrongAccept.preState).toEqual(wrongAccept.postState);
    expect(adapter.execute(action("player-b", "trade_accept", { tradeId: "trade-0001" }, 3)).result.outcome).toBe("accepted");
    const afterAccept = adapter.snapshotForVerifier();
    const invalidCancel = adapter.execute(action("player-a", "trade_cancel", { tradeId: "trade-0001" }, 4));
    expect(invalidCancel.result).toMatchObject({ outcome: "domain_rejected", domainCode: "TRADE_NOT_OPEN" });
    expect(invalidCancel.preState).toEqual(invalidCancel.postState);
    expect(adapter.snapshotForVerifier()).toEqual(afterAccept);
    const invalidAccept = adapter.execute(action("player-b", "trade_accept", { tradeId: "trade-0001" }, 5));
    expect(invalidAccept.result).toMatchObject({ outcome: "domain_rejected", domainCode: "TRADE_NOT_OPEN" });
    expect(invalidAccept.preState).toEqual(invalidAccept.postState);
  });

  it("rejects malformed and bounded numeric prices before mutation", () => {
    expect(BoundedPositiveIntSchema.safeParse(0).success).toBe(false);
    expect(BoundedPositiveIntSchema.safeParse(1.5).success).toBe(false);
    expect(BoundedPositiveIntSchema.safeParse(Number.NaN).success).toBe(false);
    expect(BoundedPositiveIntSchema.safeParse(Number.POSITIVE_INFINITY).success).toBe(false);
    expect(BoundedPositiveIntSchema.safeParse(MAX_CURRENCY + 1).success).toBe(false);
    expect(BoundedNonNegativeIntSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(false);
    expect(TradeCreateParamsSchema.safeParse({ itemId: "relic-001", counterpartyId: "player-b", price: "25" }).success).toBe(false);

    const adapter = createFixedTargetAdapter();
    const invalid = adapter.execute(action("player-a", "trade_create", { itemId: "relic-001", counterpartyId: "player-b", price: 1.25 }, 1));
    expect(invalid.result.outcome).toBe("target_error");
    expect(invalid.preState).toEqual(invalid.postState);
  });

  it("rejects arithmetic overflow without partially committing a transfer", () => {
    const adapter = createFixedTargetAdapter();
    adapter.initialize({
      schemaVersion: 1,
      players: ["player-a", "player-b"],
      startingCurrency: MAX_CURRENCY,
      uniqueItemId: "relic-001",
      ownerId: "player-a",
      seed: "overflow-test",
    });
    create(adapter);
    const result = adapter.execute(action("player-b", "trade_accept", { tradeId: "trade-0001" }, 2));
    expect(result.result).toMatchObject({ outcome: "domain_rejected", domainCode: "CURRENCY_OVERFLOW" });
    expect(result.preState).toEqual(result.postState);
  });

  it("produces identical results and virtual order on repeated runs", () => {
    const first = runKnownSequence(createFixedTargetAdapter());
    const second = runKnownSequence(createFixedTargetAdapter());
    expect(second).toEqual(first);
  });

  it("keeps privileged coordinator methods out of an actor-bound adapter", () => {
    const coordinator = createFixedTargetAdapter();
    const actor = bindActor(coordinator, "player-a");
    expect(Object.keys(actor).sort()).toEqual(["execute", "inspectForActor"]);
    expect(actor.inspectForActor("player-a").view).toEqual({ playerId: "player-a", currency: 100, inventoryItemIds: ["relic-001"] });
    expect(() => actor.inspectForActor("player-b")).toThrow("actor binding mismatch");
  });

  it("demonstrates the explicitly trusted faulty fixture without changing the action contract", () => {
    const faulty = createFaultyFixtureTargetAdapter();
    const run = runKnownSequence(faulty);
    expect(run.third.result).toMatchObject({ outcome: "accepted", domainCode: "FAULTY_ACCEPT_AFTER_COMPLETION" });
    expect(run.final.itemOccurrences).toEqual([
      { itemId: "relic-001", location: { kind: "player", playerId: "player-b" } },
      { itemId: "relic-001", location: { kind: "player", playerId: "player-a" } },
    ]);
    expect(run.final.trades).toEqual([{ tradeId: "trade-0001", sellerId: "player-a", buyerId: "player-b", itemId: "relic-001", price: 25, status: "cancelled" }]);
  });

  it("does not expose fixture selection through explorer schemas", async () => {
    const contracts = await import("@rulebreak/contracts");
    expect(contracts.parseExplorerToolArgs("trade_create", { itemId: "relic-001", counterpartyId: "player-b", price: 25, fixtureMode: "faulty" }).ok).toBe(false);
  });
});
