import { describe, expect, it } from "vitest";
import type { ActionEnvelope, ActionResult, WorldState } from "@rulebreak/contracts";
import {
  evaluateStateInvariants,
  hashWorldState,
  verifyTransition,
} from "../../packages/verifier/src/index.js";

/** Hand-built valid default world — no target mutation handlers involved. */
function validWorld(overrides: Partial<WorldState> = {}): WorldState {
  return {
    schemaVersion: 1,
    balances: { "player-a": 100, "player-b": 100 },
    itemOccurrences: [{ itemId: "relic-001", location: { kind: "player", playerId: "player-a" } }],
    trades: [],
    nextTradeSeq: 0,
    virtualClock: 0,
    seed: "rulebreak-v0-default",
    ...overrides,
  };
}

function envelope(
  kind: ActionEnvelope["kind"],
  actorId: "player-a" | "player-b",
  params: unknown,
  n: number,
): ActionEnvelope {
  return {
    schemaVersion: 1,
    campaignId: "campaign-rb007",
    worldId: "world-rb007",
    actorId,
    logicalActionId: `action-${n}`,
    transportDispatchId: `dispatch-${n}`,
    kind,
    params,
  };
}

function accepted(n: number, domainCode = "OK"): ActionResult {
  return {
    schemaVersion: 1,
    logicalActionId: `action-${n}`,
    transportDispatchId: `dispatch-${n}`,
    outcome: "accepted",
    domainCode,
    sequence: n,
  };
}

function rejected(n: number): ActionResult {
  return {
    schemaVersion: 1,
    logicalActionId: `action-${n}`,
    transportDispatchId: `dispatch-${n}`,
    outcome: "domain_rejected",
    domainCode: "NOPE",
    sequence: n,
  };
}

describe("RB-007 independent verifier (hand-built fixtures)", () => {
  it("accepts a valid default world under INV-001 and INV-003", () => {
    expect(evaluateStateInvariants(validWorld())).toEqual([]);
  });

  it("hashes identical worlds deterministically", () => {
    expect(hashWorldState(validWorld())).toBe(hashWorldState(validWorld()));
  });

  it("INV-001 catches negative balances without consulting the target", () => {
    const bad = {
      ...validWorld(),
      balances: { "player-a": -1, "player-b": 100 },
    } as unknown as WorldState;
    const failures = evaluateStateInvariants(bad);
    expect(failures.some((failure) => failure.invariantId === "INV-001")).toBe(true);
  });

  it("INV-003 catches duplicated unique-item locations (corrupted snapshot)", () => {
    const corrupted = validWorld({
      itemOccurrences: [
        { itemId: "relic-001", location: { kind: "player", playerId: "player-a" } },
        { itemId: "relic-001", location: { kind: "player", playerId: "player-b" } },
      ],
    });
    const failures = evaluateStateInvariants(corrupted);
    expect(failures.map((failure) => failure.invariantId)).toContain("INV-003");
  });

  it("INV-002 catches currency mint between transitions", () => {
    const pre = validWorld();
    const post = validWorld({ balances: { "player-a": 150, "player-b": 100 } });
    const outcome = verifyTransition({
      preState: pre,
      envelope: envelope("strategy_note", "player-a", { text: "noop" }, 1),
      result: accepted(1),
      postState: post,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.violations.some((v) => v.invariantId === "INV-002")).toBe(true);
    }
  });

  it("INV-004 catches illegal lifecycle jump accepted→cancelled", () => {
    const pre = validWorld({
      trades: [
        {
          tradeId: "trade-0001",
          sellerId: "player-a",
          buyerId: "player-b",
          itemId: "relic-001",
          price: 25,
          status: "accepted",
        },
      ],
      itemOccurrences: [{ itemId: "relic-001", location: { kind: "player", playerId: "player-b" } }],
      balances: { "player-a": 125, "player-b": 75 },
      nextTradeSeq: 1,
    });
    const post = {
      ...pre,
      trades: [{ ...pre.trades[0]!, status: "cancelled" as const }],
      itemOccurrences: [
        { itemId: "relic-001", location: { kind: "player" as const, playerId: "player-b" as const } },
        { itemId: "relic-001", location: { kind: "player" as const, playerId: "player-a" as const } },
      ],
    };
    const outcome = verifyTransition({
      preState: pre,
      envelope: envelope("trade_cancel", "player-a", { tradeId: "trade-0001" }, 3),
      result: accepted(3, "FAULTY"),
      postState: post,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      const ids = outcome.violations.map((v) => v.invariantId);
      expect(ids).toEqual(expect.arrayContaining(["INV-004", "INV-003"]));
    }
  });

  it("INV-005 catches a rejected command that still mutates balances", () => {
    const pre = validWorld();
    const post = validWorld({ balances: { "player-a": 90, "player-b": 110 } });
    const outcome = verifyTransition({
      preState: pre,
      envelope: envelope("trade_accept", "player-b", { tradeId: "trade-0001" }, 2),
      result: rejected(2),
      postState: post,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.violations.some((v) => v.invariantId === "INV-005")).toBe(true);
    }
  });

  it("passes a hand-built atomic accept transition", () => {
    const pre = validWorld({
      nextTradeSeq: 1,
      trades: [
        {
          tradeId: "trade-0001",
          sellerId: "player-a",
          buyerId: "player-b",
          itemId: "relic-001",
          price: 25,
          status: "open",
        },
      ],
      itemOccurrences: [{ itemId: "relic-001", location: { kind: "escrow", tradeId: "trade-0001" } }],
    });
    const post = validWorld({
      nextTradeSeq: 1,
      virtualClock: 1,
      balances: { "player-a": 125, "player-b": 75 },
      trades: [
        {
          tradeId: "trade-0001",
          sellerId: "player-a",
          buyerId: "player-b",
          itemId: "relic-001",
          price: 25,
          status: "accepted",
        },
      ],
      itemOccurrences: [{ itemId: "relic-001", location: { kind: "player", playerId: "player-b" } }],
    });
    const outcome = verifyTransition({
      preState: pre,
      envelope: envelope("trade_accept", "player-b", { tradeId: "trade-0001" }, 2),
      result: accepted(2, "TRADE_ACCEPTED"),
      postState: post,
    });
    expect(outcome).toEqual(
      expect.objectContaining({
        ok: true,
        preStateHash: expect.any(String),
        postStateHash: expect.any(String),
      }),
    );
  });
});
