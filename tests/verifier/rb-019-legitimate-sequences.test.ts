import { describe, expect, it } from "vitest";
import {
  APPROVED_RULE_PACK_REWARD_V1,
  APPROVED_RULE_PACK_V1,
  type ActionEnvelope,
  type PlayerId,
  type RulePack,
  type WorldState,
} from "@rulebreak/contracts";
import {
  createFaultyFixtureTargetAdapter,
  createFaultyRewardFixtureTargetAdapter,
  createFixedTargetAdapter,
  createRewardTargetAdapter,
  type CoordinatorTargetAdapter,
} from "@rulebreak/economy";
import { evaluateStateInvariants, verifyTransition } from "@rulebreak/verifier";

// RB-019 acceptance item 2: seeded property test on the fixed trade and reward fixtures.
// The target only produces the snapshots; the verifier is the thing under test. Move choice
// reads the coordinator snapshot, which is test-side code and never reaches the verifier.

/** Fixed seeds, recorded here and in docs/contracts/rb-019-invariant-tests.md. */
export const RB019_TRADE_SEEDS = Array.from({ length: 20 }, (_, i) => `rb019-trade-${String(i + 1).padStart(2, "0")}`);
export const RB019_REWARD_SEEDS = Array.from({ length: 20 }, (_, i) => `rb019-reward-${String(i + 1).padStart(2, "0")}`);
export const RB019_STEPS_PER_SEQUENCE = 40;
export const RB019_REFUSED_SHARE = 0.2;
export const RB019_GENERATOR_ID = "rb019-mulberry32-fnv1a32-legit-v1";

const PLAYERS: readonly PlayerId[] = ["player-a", "player-b"];

function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Move = { actorId: PlayerId; kind: ActionEnvelope["kind"]; params: unknown; expect: "accepted" | "domain_rejected" };

/**
 * Legitimate moves are ones the game rules allow, so the fixed target must accept them.
 * Rule-refused moves are well-formed calls the rules forbid (wrong actor, unaffordable,
 * already settled, already claimed); the fixed target must reject them without changing state.
 */
function candidateMoves(state: WorldState, family: "trade" | "reward", claimed: Set<PlayerId>, rand: () => number): Move[] {
  const moves: Move[] = [];
  const other = (p: PlayerId): PlayerId => (p === "player-a" ? "player-b" : "player-a");
  for (const occ of state.itemOccurrences) {
    if (occ.location.kind !== "player") continue;
    const seller = occ.location.playerId;
    const price = 1 + Math.floor(rand() * 60);
    moves.push({ actorId: seller, kind: "trade_create", params: { itemId: occ.itemId, counterpartyId: other(seller), price }, expect: "accepted" });
    moves.push({ actorId: other(seller), kind: "trade_create", params: { itemId: occ.itemId, counterpartyId: seller, price }, expect: "domain_rejected" });
  }
  for (const trade of state.trades) {
    const params = { tradeId: trade.tradeId };
    if (trade.status === "open") {
      const affordable = (state.balances[trade.buyerId] ?? 0) >= trade.price;
      moves.push({ actorId: trade.buyerId, kind: "trade_accept", params, expect: affordable ? "accepted" : "domain_rejected" });
      moves.push({ actorId: trade.sellerId, kind: "trade_cancel", params, expect: "accepted" });
      moves.push({ actorId: trade.sellerId, kind: "trade_accept", params, expect: "domain_rejected" });
    } else {
      moves.push({ actorId: trade.sellerId, kind: "trade_cancel", params, expect: "domain_rejected" });
      moves.push({ actorId: trade.buyerId, kind: "trade_accept", params, expect: "domain_rejected" });
    }
  }
  if (family === "reward") {
    for (const player of PLAYERS) {
      const key = `rb019-${player}-${state.virtualClock}`;
      moves.push({ actorId: player, kind: "reward_claim", params: { rewardId: "launch-bonus-001", idempotencyKey: key }, expect: claimed.has(player) ? "domain_rejected" : "accepted" });
    }
  }
  return moves;
}

type SequenceStats = { steps: number; accepted: Record<string, number>; refused: number; violations: string[] };

function runSequence(seed: string, family: "trade" | "reward", target: CoordinatorTargetAdapter, rulePack: RulePack, checkExpect: boolean): SequenceStats {
  const rand = mulberry32(fnv1a32(`${RB019_GENERATOR_ID}:${seed}`));
  target.initialize();
  const claimed = new Set<PlayerId>();
  const stats: SequenceStats = { steps: 0, accepted: {}, refused: 0, violations: [] };
  for (let step = 1; step <= RB019_STEPS_PER_SEQUENCE; step += 1) {
    const moves = candidateMoves(target.snapshotForVerifier(), family, claimed, rand);
    const legit = moves.filter((m) => m.expect === "accepted");
    const refused = moves.filter((m) => m.expect === "domain_rejected");
    // Mostly legitimate play, with a fixed share of rule-refused calls mixed in.
    const pool = refused.length > 0 && (legit.length === 0 || rand() < RB019_REFUSED_SHARE) ? refused : legit;
    const move = pool[Math.floor(rand() * pool.length)]!;
    const envelope: ActionEnvelope = {
      schemaVersion: 1,
      campaignId: "campaign-rb019",
      worldId: `world-${seed}`,
      actorId: move.actorId,
      logicalActionId: `action-${step}`,
      transportDispatchId: `dispatch-${step}`,
      kind: move.kind,
      params: move.params,
    };
    const execution = target.execute(envelope);
    stats.steps += 1;
    if (checkExpect) expect(execution.result.outcome, `${seed} step ${step} ${move.kind}`).toBe(move.expect);
    if (execution.result.outcome === "accepted") {
      stats.accepted[move.kind] = (stats.accepted[move.kind] ?? 0) + 1;
      if (move.kind === "reward_claim") claimed.add(move.actorId);
    } else {
      stats.refused += 1;
    }
    const outcome = verifyTransition({ preState: execution.preState, envelope, result: execution.result, postState: execution.postState, rulePack });
    if (!outcome.ok) stats.violations.push(...outcome.violations.map((v) => `${seed} step ${step}: ${v.invariantId} ${v.message}`));
    for (const failure of evaluateStateInvariants(execution.postState, rulePack)) {
      stats.violations.push(`${seed} step ${step} (state): ${failure.invariantId} ${failure.message}`);
    }
  }
  target.dispose();
  return stats;
}

function total(all: SequenceStats[], kind: string): number {
  return all.reduce((sum, s) => sum + (s.accepted[kind] ?? 0), 0);
}

describe("RB-019 seeded legitimate sequences on the fixed fixtures", () => {
  it(`trade: ${RB019_TRADE_SEEDS.length} generated sequences on fixed seeds report no violations`, () => {
    const all = RB019_TRADE_SEEDS.map((seed) => runSequence(seed, "trade", createFixedTargetAdapter(), APPROVED_RULE_PACK_V1, true));
    expect(all.flatMap((s) => s.violations)).toEqual([]);
    // Not vacuous: every legitimate trade move and some rule-refused moves actually happened.
    // Pinned so the counts in docs/contracts/rb-019-invariant-tests.md stay checked.
    expect(all.reduce((sum, s) => sum + s.steps, 0)).toBe(800);
    expect([total(all, "trade_create"), total(all, "trade_accept"), total(all, "trade_cancel")]).toEqual([322, 158, 153]);
    expect(all.reduce((sum, s) => sum + s.refused, 0)).toBe(167);
  });

  it(`reward: ${RB019_REWARD_SEEDS.length} generated sequences on fixed seeds report no violations`, () => {
    const all = RB019_REWARD_SEEDS.map((seed) => runSequence(seed, "reward", createRewardTargetAdapter(), APPROVED_RULE_PACK_REWARD_V1, true));
    expect(all.flatMap((s) => s.violations)).toEqual([]);
    expect(all.reduce((sum, s) => sum + s.steps, 0)).toBe(800);
    expect([total(all, "trade_create"), total(all, "trade_accept"), total(all, "trade_cancel"), total(all, "reward_claim")]).toEqual([292, 153, 128, 40]);
    expect(all.reduce((sum, s) => sum + s.refused, 0)).toBe(187);
  });

  it("the sequences are deterministic for a fixed seed", () => {
    const first = runSequence(RB019_TRADE_SEEDS[0]!, "trade", createFixedTargetAdapter(), APPROVED_RULE_PACK_V1, false);
    const second = runSequence(RB019_TRADE_SEEDS[0]!, "trade", createFixedTargetAdapter(), APPROVED_RULE_PACK_V1, false);
    expect(second).toEqual(first);
  });

  // Controls (by construction): the same generator, unchanged, on the faulty fixtures. Each faulty
  // fixture accepts one call the generator issues as rule-refused (cancel after acceptance on trade,
  // a second claim with a new idempotency key on reward), so a non-blind harness must flag it.
  it("control: on the faulty trade fixture, 19 of the 20 generated sequences on fixed seeds reach a violation", () => {
    const all = RB019_TRADE_SEEDS.map((seed) => runSequence(seed, "trade", createFaultyFixtureTargetAdapter(), APPROVED_RULE_PACK_V1, false));
    expect(all.filter((s) => s.violations.length > 0)).toHaveLength(19);
  });

  it("control: on the faulty reward fixture, 14 of the 20 generated sequences on fixed seeds reach INV-006", () => {
    const all = RB019_REWARD_SEEDS.map((seed) => runSequence(seed, "reward", createFaultyRewardFixtureTargetAdapter(), APPROVED_RULE_PACK_REWARD_V1, false));
    const reached = all.filter((s) => s.violations.some((v) => v.includes("INV-006")));
    expect(reached).toHaveLength(14);
    expect(all.filter((s) => s.violations.length > 0)).toHaveLength(14);
  });
});
