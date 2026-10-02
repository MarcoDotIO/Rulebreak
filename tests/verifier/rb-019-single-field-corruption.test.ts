import { describe, expect, it } from "vitest";
import {
  APPROVED_RULE_PACK_REWARD_V1,
  MAX_CURRENCY,
  type ActionEnvelope,
  type ActionResult,
  type WorldState,
} from "@rulebreak/contracts";
import { evaluateStateInvariants, evaluateTransitionInvariants, verifyTransition } from "@rulebreak/verifier";

// RB-019 acceptance item 1. Hand-built snapshots only; no target code is used as an oracle
// (AGENTS.md §7). Every case runs under the reward rule pack so all six invariants are
// enabled, which is what makes "caught by no other invariant" a real check.
const RULE_PACK = APPROVED_RULE_PACK_REWARD_V1;

type Transition = { pre: WorldState; envelope: ActionEnvelope; result: ActionResult; post: WorldState };

function world(overrides: Partial<WorldState> = {}): WorldState {
  return {
    schemaVersion: 1,
    balances: { "player-a": 100, "player-b": 100 },
    itemOccurrences: [
      { itemId: "relic-001", location: { kind: "player", playerId: "player-a" } },
      { itemId: "relic-002", location: { kind: "player", playerId: "player-b" } },
    ],
    trades: [],
    nextTradeSeq: 0,
    virtualClock: 0,
    seed: "rb-019-single-field",
    rewardPoints: { "player-a": 0, "player-b": 0 },
    rewardClaims: [],
    ...overrides,
  };
}

function envelope(kind: ActionEnvelope["kind"], actorId: "player-a" | "player-b", params: unknown): ActionEnvelope {
  return { schemaVersion: 1, campaignId: "campaign-rb019", worldId: "world-rb019", actorId, logicalActionId: "action-1", transportDispatchId: "dispatch-1", kind, params };
}

function result(outcome: ActionResult["outcome"] = "accepted"): ActionResult {
  return { schemaVersion: 1, logicalActionId: "action-1", transportDispatchId: "dispatch-1", outcome, sequence: 1 };
}

const note = () => envelope("strategy_note", "player-a", { text: "rb-019" });

/** A valid accepted note: only the clock moves. */
function noteTransition(pre: WorldState = world()): Transition {
  return { pre, envelope: note(), result: result(), post: { ...structuredClone(pre), virtualClock: pre.virtualClock + 1 } };
}

const tradeOpen = {
  tradeId: "trade-0001",
  sellerId: "player-a" as const,
  buyerId: "player-b" as const,
  itemId: "relic-001",
  price: 25,
};

/** A valid atomic accept of trade-0001 by player-b. */
function acceptTransition(): Transition {
  const pre = world({
    nextTradeSeq: 1,
    trades: [{ ...tradeOpen, status: "open" }],
    itemOccurrences: [
      { itemId: "relic-001", location: { kind: "escrow", tradeId: "trade-0001" } },
      { itemId: "relic-002", location: { kind: "player", playerId: "player-b" } },
    ],
  });
  const post = world({
    nextTradeSeq: 1,
    virtualClock: 1,
    balances: { "player-a": 125, "player-b": 75 },
    trades: [{ ...tradeOpen, status: "accepted" }],
    itemOccurrences: [
      { itemId: "relic-001", location: { kind: "player", playerId: "player-b" } },
      { itemId: "relic-002", location: { kind: "player", playerId: "player-b" } },
    ],
  });
  return { pre, envelope: envelope("trade_accept", "player-b", { tradeId: "trade-0001" }), result: result(), post };
}

/** A valid note after trade-0001 was accepted earlier. */
function settledTransition(): Transition {
  return noteTransition(acceptTransition().post);
}

/** A valid in-policy reward claim by player-a. */
function claimTransition(): Transition {
  const pre = world();
  const post = world({
    virtualClock: 1,
    rewardPoints: { "player-a": 10, "player-b": 0 },
    rewardClaims: [{ rewardId: "launch-bonus-001", playerId: "player-a", idempotencyKey: "key-a-1" }],
  });
  return { pre, envelope: envelope("reward_claim", "player-a", { rewardId: "launch-bonus-001", idempotencyKey: "key-a-1" }), result: result(), post };
}

/** Count leaf paths that differ, so each corruption is provably one field. */
function leafDiffs(a: unknown, b: unknown, path = "$"): string[] {
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return Object.is(a, b) ? [] : [path];
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].flatMap((key) =>
    leafDiffs((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`),
  );
}

function transitionIds(t: Transition): string[] {
  return [...new Set(evaluateTransitionInvariants(t.pre, t.envelope, t.result, t.post, RULE_PACK).map((f) => f.invariantId))].sort();
}

function stateIds(state: WorldState): string[] {
  return [...new Set(evaluateStateInvariants(state, RULE_PACK).map((f) => f.invariantId))].sort();
}

type Corruption<T> = { name: string; mutate: (value: T) => void };

function corrupt<T>(value: T, corruption: Corruption<T>): T {
  const copy = structuredClone(value);
  corruption.mutate(copy);
  expect(leafDiffs(value, copy), `${corruption.name} must change exactly one field`).toHaveLength(1);
  return copy;
}

type StateCase = { id: string; valid: () => WorldState; corruptions: Corruption<WorldState>[] };
type TransitionCase = { id: string; valid: () => Transition; corruptions: Corruption<Transition>[] };

// INV-001 and INV-003 are state invariants. INV-001 is checked through the state path because
// the transition path parses both snapshots first and throws on a structurally invalid one
// (see the separate test below); that is fail-closed, not a missed violation.
const STATE_CASES: StateCase[] = [
  {
    id: "INV-001",
    valid: () => world(),
    corruptions: [
      { name: "negative balance", mutate: (s) => { s.balances["player-a"] = -1; } },
      { name: "balance above MAX_CURRENCY", mutate: (s) => { s.balances["player-b"] = MAX_CURRENCY + 1; } },
      { name: "fractional nextTradeSeq", mutate: (s) => { s.nextTradeSeq = 0.5; } },
      { name: "negative virtualClock", mutate: (s) => { s.virtualClock = -1; } },
    ],
  },
  {
    id: "INV-003",
    valid: () => world(),
    corruptions: [
      { name: "second item renamed onto the first", mutate: (s) => { s.itemOccurrences[1]!.itemId = "relic-001"; } },
    ],
  },
];

const TRANSITION_CASES: TransitionCase[] = [
  {
    id: "INV-002",
    valid: () => noteTransition(),
    corruptions: [
      { name: "post balance minted", mutate: (t) => { t.post.balances["player-a"] = 150; } },
      { name: "post balance burned", mutate: (t) => { t.post.balances["player-b"] = 90; } },
    ],
  },
  {
    id: "INV-003",
    valid: () => noteTransition(),
    corruptions: [
      { name: "post item duplicated by rename", mutate: (t) => { t.post.itemOccurrences[1]!.itemId = "relic-001"; } },
    ],
  },
  {
    id: "INV-004",
    valid: () => settledTransition(),
    corruptions: [
      { name: "accepted trade moved to cancelled", mutate: (t) => { t.post.trades[0]!.status = "cancelled"; } },
      { name: "accepted trade moved back to open", mutate: (t) => { t.post.trades[0]!.status = "open"; } },
    ],
  },
  {
    id: "INV-005",
    valid: () => acceptTransition(),
    corruptions: [
      { name: "accepted item left with seller", mutate: (t) => { (t.post.itemOccurrences[0]!.location as { playerId: string }).playerId = "player-a"; } },
      { name: "rejected outcome that still mutated state", mutate: (t) => { t.result.outcome = "domain_rejected"; } },
      { name: "accept of a trade that was not open", mutate: (t) => { t.pre.trades[0]!.status = "accepted"; } },
    ],
  },
  {
    id: "INV-006",
    valid: () => claimTransition(),
    corruptions: [
      { name: "grant above the policy ceiling", mutate: (t) => { t.post.rewardPoints!["player-a"] = 20; } },
      { name: "points granted to the other player", mutate: (t) => { t.post.rewardPoints!["player-b"] = 10; } },
      { name: "claim attributed to the other actor", mutate: (t) => { t.envelope.actorId = "player-b"; } },
      { name: "points moved on a rejected claim", mutate: (t) => { t.result.outcome = "domain_rejected"; } },
    ],
  },
];

describe("RB-019 single-field corruptions are caught by the expected invariant and no other", () => {
  describe.each(STATE_CASES)("$id (state)", ({ id, valid, corruptions }) => {
    it("the valid state reports nothing", () => {
      expect(stateIds(valid())).toEqual([]);
    });
    it.each(corruptions)("$name", (corruption) => {
      expect(stateIds(corrupt(valid(), corruption))).toEqual([id]);
    });
  });

  describe.each(TRANSITION_CASES)("$id (transition)", ({ id, valid, corruptions }) => {
    it("the valid transition reports nothing", () => {
      const t = valid();
      expect(transitionIds(t)).toEqual([]);
      expect(verifyTransition({ preState: t.pre, envelope: t.envelope, result: t.result, postState: t.post, rulePack: RULE_PACK }).ok).toBe(true);
    });
    it.each(corruptions)("$name", (corruption) => {
      expect(transitionIds(corrupt(valid(), corruption))).toEqual([id]);
    });
  });

  it("every one of INV-001 to INV-006 has a valid case and at least one corruption", () => {
    const covered = new Set([...STATE_CASES, ...TRANSITION_CASES].filter((c) => c.corruptions.length > 0).map((c) => c.id));
    expect([...covered].sort()).toEqual(["INV-001", "INV-002", "INV-003", "INV-004", "INV-005", "INV-006"]);
  });

  it("the transition path refuses a structurally invalid snapshot by throwing (fail closed)", () => {
    const t = noteTransition();
    t.post.balances["player-a"] = -1;
    expect(() => evaluateTransitionInvariants(t.pre, t.envelope, t.result, t.post, RULE_PACK)).toThrow();
  });
});
