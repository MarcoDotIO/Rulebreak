/** Visibly labeled mock data — not schema-validated until RB-005 contracts land. */
export type RunMode = "live_agents" | "scripted_fixture" | "recorded_replay";
export type FindingStatus =
  | "candidate"
  | "confirmed"
  | "not_reproduced"
  | "inconclusive";

export type MockAction = {
  eventId: string;
  sequence: number;
  actor: "explorer_a" | "explorer_b" | "scripted_driver" | "system";
  type: string;
  summary: string;
  at: string;
  balances?: Record<string, number>;
};

export type MockFinding = {
  id: string;
  status: FindingStatus;
  ruleId: string;
  ruleTitle: string;
  responsibleActionId: string;
  before: Record<string, number>;
  after: Record<string, number>;
  replayStatus: "pending" | "matched_faulty" | "fixed_clean" | "diverged";
  limitations: string[];
};

export const MOCK_BANNER =
  "MOCK DATA — not live campaign state. Remove mock routing before acceptance.";

export const mockCampaign = {
  id: "camp_mock_trade_fail_001",
  mode: "scripted_fixture" as RunMode,
  target: "trade-economy@fixed-vs-faulty",
  rulePack: "p0-conservation-v1",
  agentMode: "scripted_driver",
  budgets: {
    maxToolCalls: 200,
    maxMutations: 100,
    maxCampaignSeconds: 600,
    maxCostUsd: 0,
  },
  spendConfirmed: true,
  state: "stopped" as const,
};

export const mockTimeline: MockAction[] = [
  {
    eventId: "evt_001",
    sequence: 1,
    actor: "scripted_driver",
    type: "campaign.started",
    summary: "Scripted trade-failure sequence started",
    at: "2026-09-15T20:00:00.000Z",
  },
  {
    eventId: "evt_002",
    sequence: 2,
    actor: "scripted_driver",
    type: "trade.submitted",
    summary: "Buy 10 ore from market (player_a)",
    at: "2026-09-15T20:00:01.000Z",
    balances: { player_a_gold: 100, player_a_ore: 0, market_ore: 50 },
  },
  {
    eventId: "evt_003",
    sequence: 3,
    actor: "scripted_driver",
    type: "trade.completed",
    summary: "Trade accepted by faulty target (gold not deducted)",
    at: "2026-09-15T20:00:01.200Z",
    balances: { player_a_gold: 100, player_a_ore: 10, market_ore: 40 },
  },
  {
    eventId: "evt_004",
    sequence: 4,
    actor: "system",
    type: "rule.violation",
    summary: "conservation.gold_ore: gold conserved across trade — FAILED",
    at: "2026-09-15T20:00:01.350Z",
  },
  {
    eventId: "evt_005",
    sequence: 5,
    actor: "system",
    type: "campaign.stopped",
    summary: "Stop after confirmed violation",
    at: "2026-09-15T20:00:01.400Z",
  },
];

export const mockFinding: MockFinding = {
  id: "find_mock_001",
  status: "confirmed",
  ruleId: "conservation.gold_ore",
  ruleTitle: "Gold and ore must conserve across a completed trade",
  responsibleActionId: "evt_003",
  before: { player_a_gold: 100, player_a_ore: 0, market_ore: 50 },
  after: { player_a_gold: 100, player_a_ore: 10, market_ore: 40 },
  replayStatus: "matched_faulty",
  limitations: [
    "Synthetic economy only — not a live game server",
    "Scripted driver path; live AgenC explorers not yet attached",
    "Mock event shapes pending RB-005 contract freeze",
  ],
};
