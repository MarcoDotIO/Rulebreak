import { describe, expect, it } from "vitest";
import {
  APPROVED_RULE_PACK_REWARD_V1,
  REWARD_ENTITLEMENT_POLICY_V1,
  type ActionEnvelope,
  type ActionResult,
  type RulePack,
  type WorldState,
} from "@rulebreak/contracts";
import {
  checkInv006State,
  checkInv006Transition,
  evaluateStateInvariants,
  evaluateTransitionInvariants,
} from "@rulebreak/verifier";

// Hand-built snapshots only; no target code is used as an oracle (AGENTS.md §7).
const policy = REWARD_ENTITLEMENT_POLICY_V1;

function world(points: Record<string, number>, claims: WorldState["rewardClaims"] = []): WorldState {
  return {
    schemaVersion: 1,
    balances: { "player-a": 100, "player-b": 100 },
    itemOccurrences: [{ itemId: "relic-001", location: { kind: "player", playerId: "player-a" } }],
    trades: [],
    nextTradeSeq: 0,
    virtualClock: 0,
    seed: "inv-006-test",
    rewardPoints: points as WorldState["rewardPoints"],
    rewardClaims: claims,
  };
}

function claim(actorId: "player-a" | "player-b", rewardId = "launch-bonus-001"): ActionEnvelope {
  return {
    schemaVersion: 1,
    campaignId: "c",
    worldId: "w",
    actorId,
    logicalActionId: "action-1",
    transportDispatchId: "dispatch-1",
    kind: "reward_claim",
    params: { rewardId, idempotencyKey: "k" },
  };
}

const accepted: ActionResult = { schemaVersion: 1, logicalActionId: "action-1", transportDispatchId: "dispatch-1", outcome: "accepted", sequence: 1 };
const rejected: ActionResult = { ...accepted, outcome: "domain_rejected" };

describe("INV-006 state check", () => {
  it("allows balances up to the entitlement ceiling", () => {
    expect(checkInv006State(world({ "player-a": 0, "player-b": 0 }), policy)).toBeNull();
    expect(checkInv006State(world({ "player-a": 10, "player-b": 10 }), policy)).toBeNull();
  });

  it("fails above the ceiling even when the target's ledger shows a single claim", () => {
    const state = world({ "player-a": 20, "player-b": 0 }, [{ rewardId: "launch-bonus-001", playerId: "player-a", idempotencyKey: "k2" }]);
    expect(checkInv006State(state, policy)?.invariantId).toBe("INV-006");
  });

  it("ignores the ledger: many ledger rows with in-policy points still pass", () => {
    const ledger = ["k1", "k2", "k3"].map((key) => ({ rewardId: "launch-bonus-001", playerId: "player-a" as const, idempotencyKey: key }));
    expect(checkInv006State(world({ "player-a": 10, "player-b": 0 }, ledger), policy)).toBeNull();
  });
});

describe("INV-006 transition check", () => {
  it("accepts one in-policy grant to the claiming actor", () => {
    expect(checkInv006Transition(world({ "player-a": 0, "player-b": 0 }), claim("player-a"), accepted, world({ "player-a": 10, "player-b": 0 }), policy)).toBeNull();
  });

  it("rejects a grant larger than the reward amount", () => {
    expect(checkInv006Transition(world({ "player-a": 0, "player-b": 0 }), claim("player-a"), accepted, world({ "player-a": 11, "player-b": 0 }), policy)?.invariantId).toBe("INV-006");
  });

  it("rejects points moving for another player", () => {
    expect(checkInv006Transition(world({ "player-a": 0, "player-b": 0 }), claim("player-a"), accepted, world({ "player-a": 0, "player-b": 10 }), policy)?.invariantId).toBe("INV-006");
  });

  it("rejects points moving on a rejected claim", () => {
    expect(checkInv006Transition(world({ "player-a": 0, "player-b": 0 }), claim("player-a"), rejected, world({ "player-a": 10, "player-b": 0 }), policy)?.invariantId).toBe("INV-006");
  });

  it("rejects a grant for a reward the policy does not name", () => {
    expect(checkInv006Transition(world({ "player-a": 0, "player-b": 0 }), claim("player-a", "made-up"), accepted, world({ "player-a": 5, "player-b": 0 }), policy)?.invariantId).toBe("INV-006");
  });

  it("rejects points appearing on a non-reward action", () => {
    const trade: ActionEnvelope = { ...claim("player-a"), kind: "trade_cancel", params: { tradeId: "trade-0001" } };
    expect(checkInv006Transition(world({ "player-a": 0, "player-b": 0 }), trade, accepted, world({ "player-a": 10, "player-b": 0 }), policy)?.invariantId).toBe("INV-006");
  });
});

describe("rule-pack wiring", () => {
  it("the reward pack runs INV-006 through the evaluators", () => {
    const over = world({ "player-a": 20, "player-b": 0 });
    expect(evaluateStateInvariants(over, APPROVED_RULE_PACK_REWARD_V1).map((f) => f.invariantId)).toContain("INV-006");
    const ids = evaluateTransitionInvariants(world({ "player-a": 10, "player-b": 0 }), claim("player-a"), accepted, over, APPROVED_RULE_PACK_REWARD_V1).map((f) => f.invariantId);
    expect(ids).toContain("INV-006");
  });

  it("fails closed when INV-006 is enabled without an approved policy", () => {
    const bad: RulePack = { ...APPROVED_RULE_PACK_REWARD_V1, entitlementPolicyId: "unknown-policy" };
    expect(() => evaluateStateInvariants(world({ "player-a": 0, "player-b": 0 }), bad)).toThrow(/approved entitlement policy/);
    const missing: RulePack = { ...APPROVED_RULE_PACK_REWARD_V1, entitlementPolicyId: undefined };
    expect(() => evaluateStateInvariants(world({ "player-a": 0, "player-b": 0 }), missing)).toThrow(/approved entitlement policy/);
  });
});
