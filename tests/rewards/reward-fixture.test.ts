import { describe, expect, it } from "vitest";
import {
  APPROVED_RULE_PACK_REWARD_V1,
  APPROVED_RULE_PACK_V1,
  REWARD_ENTITLEMENT_POLICY_V1,
  type ActionEnvelope,
  type InvariantViolation,
} from "@rulebreak/contracts";
import { hashWorldState, verifyTransition } from "@rulebreak/verifier";
import {
  REWARD_CATALOG_V1,
  createFaultyRewardFixtureTargetAdapter,
  createFixedTargetAdapter,
  createRewardTargetAdapter,
  knownRewardDoubleClaimSteps,
  type CoordinatorTargetAdapter,
  type RewardScriptedStep,
} from "../../packages/economy/src/index.js";

type DriverStep = { outcome: string; domainCode: string | undefined; violations: InvariantViolation[] };

/** Offline driver: run scripted steps, verify each transition, freeze on the first violation. */
function drive(target: CoordinatorTargetAdapter, steps: RewardScriptedStep[]) {
  const log: DriverStep[] = [];
  for (const [index, step] of steps.entries()) {
    const n = index + 1;
    const envelope: ActionEnvelope = {
      schemaVersion: 1,
      campaignId: "rb-016-driver",
      worldId: "world-rb-016-driver",
      actorId: step.actorId,
      logicalActionId: `action-${n}`,
      transportDispatchId: `dispatch-${n}`,
      kind: step.kind,
      params: step.params,
    };
    const { result, preState, postState } = target.execute(envelope);
    const verdict = verifyTransition({ preState, envelope, result, postState, rulePack: APPROVED_RULE_PACK_REWARD_V1 });
    log.push({ outcome: result.outcome, domainCode: result.domainCode, violations: verdict.ok ? [] : verdict.violations });
    if (!verdict.ok) break;
  }
  return { log, final: target.snapshotForVerifier() };
}

/** RB-016 regression: fails on the faulty reward target, passes on the fixed one. */
function assertNoRewardOverGrant(target: CoordinatorTargetAdapter) {
  const { log } = drive(target, knownRewardDoubleClaimSteps());
  const broken = log.flatMap((step) => step.violations.map((v) => `${v.invariantId}@${v.sequence}`));
  if (broken.length > 0) throw new Error(`reward over-grant: ${broken.join(", ")}`);
}

describe("RB-016 reward fixture", () => {
  it("regression test passes on the fixed target and legitimate claims stay green", () => {
    const target = createRewardTargetAdapter();
    assertNoRewardOverGrant(target);
    const { log, final } = drive(createRewardTargetAdapter(), knownRewardDoubleClaimSteps());
    expect(log.map((step) => step.domainCode)).toEqual(["REWARD_GRANTED", "ALREADY_CLAIMED", "REWARD_GRANTED", "ALREADY_CLAIMED"]);
    expect(final.rewardPoints).toEqual({ "player-a": 10, "player-b": 10 });
    expect(final.balances).toEqual({ "player-a": 100, "player-b": 100 });
  });

  it("regression test fails on the faulty target", () => {
    expect(() => assertNoRewardOverGrant(createFaultyRewardFixtureTargetAdapter())).toThrow(/reward over-grant: INV-006@4/);
  });

  it("faulty target breaks INV-006 on the second claim while its own ledger still shows one claim", () => {
    const { log, final } = drive(createFaultyRewardFixtureTargetAdapter(), knownRewardDoubleClaimSteps());
    expect(log).toHaveLength(4);
    expect(log.slice(0, 3).every((step) => step.violations.length === 0)).toBe(true);
    expect(log[1]?.domainCode).toBe("DUPLICATE_IDEMPOTENCY_KEY");
    const last = log[3]!;
    expect(last.outcome).toBe("accepted");
    expect(last.violations.map((v) => v.invariantId)).toContain("INV-006");
    expect(last.violations.every((v) => v.invariantId === "INV-006")).toBe(true);
    expect(last.violations[0]?.sequence).toBe(4);
    expect(final.rewardPoints?.["player-a"]).toBe(20);
    // The target's own counter would pass: one ledger row per (player, reward).
    const aClaims = (final.rewardClaims ?? []).filter((c) => c.playerId === "player-a" && c.rewardId === "launch-bonus-001");
    expect(aClaims).toHaveLength(1);
  });

  it("replays offline to the same states and the same violation", () => {
    const runs = [0, 1].map(() => {
      const target = createFaultyRewardFixtureTargetAdapter();
      target.initialize();
      const initialHash = hashWorldState(target.snapshotForVerifier());
      const { log, final } = drive(target, knownRewardDoubleClaimSteps());
      return { initialHash, finalHash: hashWorldState(final), violations: log.flatMap((s) => s.violations) };
    });
    expect(runs[1]).toEqual(runs[0]);
    expect(runs[0]?.violations.length).toBeGreaterThan(0);
  });

  it("initialize() keeps rewards enabled and resets points", () => {
    const target = createFaultyRewardFixtureTargetAdapter();
    drive(target, knownRewardDoubleClaimSteps());
    const reset = target.initialize();
    expect(reset.rewardPoints).toEqual({ "player-a": 0, "player-b": 0 });
    expect(reset.rewardClaims).toEqual([]);
  });

  it("the target catalog agrees with the approved policy (they are defined separately on purpose)", () => {
    const policy = REWARD_ENTITLEMENT_POLICY_V1.rewards.map(({ rewardId, amount, maxClaimsPerPlayer }) => ({ rewardId, amount, maxClaimsPerPlayer }));
    expect([...REWARD_CATALOG_V1]).toEqual(policy);
  });
});

describe("RB-016 leaves the trade fixture unchanged", () => {
  it("trade-only worlds carry no reward keys and reject reward_claim without a state change", () => {
    const target = createFixedTargetAdapter();
    const before = target.snapshotForVerifier();
    expect("rewardPoints" in before).toBe(false);
    expect("rewardClaims" in before).toBe(false);
    const { log, final } = drive(target, knownRewardDoubleClaimSteps().slice(0, 1));
    expect(log[0]?.domainCode).toBe("REWARDS_DISABLED");
    expect(hashWorldState(final)).toBe(hashWorldState(before));
  });

  it("rulebreak-trade-v1 is unchanged and has no policy", () => {
    expect(APPROVED_RULE_PACK_V1.rulePackId).toBe("rulebreak-trade-v1");
    expect(APPROVED_RULE_PACK_V1.invariantIds).not.toContain("INV-006");
    expect(APPROVED_RULE_PACK_V1.entitlementPolicyId).toBeUndefined();
    expect(APPROVED_RULE_PACK_REWARD_V1.invariantIds).toEqual([...APPROVED_RULE_PACK_V1.invariantIds, "INV-006"]);
  });
});
