/**
 * Visibly labeled mock fixtures validated against frozen @rulebreak/contracts.
 * Not live campaign state — no event-stream integration yet (RB-008/RB-009).
 */
import {
  APPROVED_RULE_PACK_V1,
  CampaignEventSchema,
  CampaignSchema,
  FindingSchema,
  ReplayResultSchema,
  TargetManifestSchema,
  UsageLedgerSchema,
  type Campaign,
  type CampaignEvent,
  type Finding,
  type ProvenanceMode,
  type ReplayResult,
  type TargetManifest,
  type UsageLedger,
} from "@rulebreak/contracts";

export const MOCK_BANNER =
  "MOCK DATA — not live campaign state. Remove mock routing before acceptance.";

/** Display labels for contract provenance enums (AGENTS.md §15). */
export const PROVENANCE_LABELS: Record<ProvenanceMode, string> = {
  live: "Live agents",
  scripted: "Scripted fixture",
  recorded: "Recorded replay",
};

export const REPLAY_OUTCOME_LABELS: Record<ReplayResult["outcome"], string> = {
  matched_violation: "matched_violation",
  diverged: "diverged",
  blocked_as_expected: "blocked_as_expected",
  error: "error",
};

const CAMPAIGN_ID = "camp_mock_trade_fail_001";
const FINDING_ID = "find_mock_001";
const FAULTY_TARGET_ID = "synth-trade-faulty";
const PRE_HASH = "hash_pre_cancel_dup";
const POST_HASH = "hash_post_cancel_dup";

/** UI-only budget presentation; not a frozen campaign schema field. */
export const mockBudgets = {
  maxToolCalls: 200,
  maxMutations: 100,
  maxCampaignSeconds: 600,
  maxCostUsd: 0,
  spendConfirmed: true,
} as const;

export const mockTarget: TargetManifest = TargetManifestSchema.parse({
  schemaVersion: 1,
  targetId: FAULTY_TARGET_ID,
  displayName: "Synthetic trade (faulty fixture)",
  fixtureMode: "faulty",
  buildId: "local-mock-rb010",
  publicContractVersion: 1,
});

export const mockCampaign: Campaign = CampaignSchema.parse({
  schemaVersion: 1,
  campaignId: CAMPAIGN_ID,
  status: "stopped",
  mode: "scripted",
  targetId: FAULTY_TARGET_ID,
  rulePackId: APPROVED_RULE_PACK_V1.rulePackId,
  createdAt: "2026-09-15T20:00:00.000Z",
  stopRequested: true,
});

export const mockUsage: UsageLedger = UsageLedgerSchema.parse({
  schemaVersion: 1,
  campaignId: CAMPAIGN_ID,
  toolCalls: 4,
  mutations: 2,
  tokens: 0,
  costUsd: 0,
  elapsedSeconds: 1.4,
});

/**
 * Display-only inventory summary for finding evidence table.
 * Hashes map to the finding violation; live snapshots arrive with RB-008/RB-009.
 */
export const mockBalanceEvidence = {
  before: {
    "player-a.currency": 100,
    "player-a.inventory": "[]",
    "player-b.currency": 90,
    "player-b.inventory": "relic-001",
    "escrow.trade-1": "(empty)",
  },
  after: {
    "player-a.currency": 100,
    "player-a.inventory": "relic-001",
    "player-b.currency": 90,
    "player-b.inventory": "relic-001",
    "escrow.trade-1": "(empty)",
  },
} as const;

export const mockEvents: CampaignEvent[] = [
  CampaignEventSchema.parse({
    schemaVersion: 1,
    eventId: "evt_001",
    campaignId: CAMPAIGN_ID,
    sequence: 1,
    timestamp: "2026-09-15T20:00:00.000Z",
    mode: "scripted",
    type: "campaign_state",
    payload: { status: "running", stopRequested: false },
  }),
  CampaignEventSchema.parse({
    schemaVersion: 1,
    eventId: "evt_002",
    campaignId: CAMPAIGN_ID,
    sequence: 2,
    timestamp: "2026-09-15T20:00:00.100Z",
    mode: "scripted",
    type: "agent_status",
    payload: { actorId: "player-a", status: "exploring" },
  }),
  CampaignEventSchema.parse({
    schemaVersion: 1,
    eventId: "evt_003",
    campaignId: CAMPAIGN_ID,
    sequence: 3,
    timestamp: "2026-09-15T20:00:01.000Z",
    mode: "scripted",
    type: "action_submitted",
    payload: {
      logicalActionId: "act_create_1",
      kind: "trade_create",
      actorId: "player-a",
    },
  }),
  CampaignEventSchema.parse({
    schemaVersion: 1,
    eventId: "evt_004",
    campaignId: CAMPAIGN_ID,
    sequence: 4,
    timestamp: "2026-09-15T20:00:01.050Z",
    mode: "scripted",
    type: "action_completed",
    payload: {
      schemaVersion: 1,
      logicalActionId: "act_create_1",
      transportDispatchId: "disp_create_1",
      outcome: "accepted",
      message: "Trade trade-1 opened; relic-001 moved to escrow",
      sequence: 1,
    },
  }),
  CampaignEventSchema.parse({
    schemaVersion: 1,
    eventId: "evt_005",
    campaignId: CAMPAIGN_ID,
    sequence: 5,
    timestamp: "2026-09-15T20:00:01.100Z",
    mode: "scripted",
    type: "action_submitted",
    payload: {
      logicalActionId: "act_accept_1",
      kind: "trade_accept",
      actorId: "player-b",
    },
  }),
  CampaignEventSchema.parse({
    schemaVersion: 1,
    eventId: "evt_006",
    campaignId: CAMPAIGN_ID,
    sequence: 6,
    timestamp: "2026-09-15T20:00:01.150Z",
    mode: "scripted",
    type: "action_completed",
    payload: {
      schemaVersion: 1,
      logicalActionId: "act_accept_1",
      transportDispatchId: "disp_accept_1",
      outcome: "accepted",
      message: "Trade trade-1 accepted; relic-001 transferred to player-b",
      sequence: 2,
    },
  }),
  CampaignEventSchema.parse({
    schemaVersion: 1,
    eventId: "evt_007",
    campaignId: CAMPAIGN_ID,
    sequence: 7,
    timestamp: "2026-09-15T20:00:01.200Z",
    mode: "scripted",
    type: "action_submitted",
    payload: {
      logicalActionId: "act_cancel_1",
      kind: "trade_cancel",
      actorId: "player-a",
    },
  }),
  CampaignEventSchema.parse({
    schemaVersion: 1,
    eventId: "evt_008",
    campaignId: CAMPAIGN_ID,
    sequence: 8,
    timestamp: "2026-09-15T20:00:01.250Z",
    mode: "scripted",
    type: "action_completed",
    payload: {
      schemaVersion: 1,
      logicalActionId: "act_cancel_1",
      transportDispatchId: "disp_cancel_1",
      outcome: "accepted",
      domainCode: "FAULTY_POST_ACCEPT_CANCEL",
      message:
        "Faulty target accepted cancel after accept — duplicated relic-001",
      sequence: 3,
    },
  }),
  CampaignEventSchema.parse({
    schemaVersion: 1,
    eventId: "evt_009",
    campaignId: CAMPAIGN_ID,
    sequence: 9,
    timestamp: "2026-09-15T20:00:01.350Z",
    mode: "scripted",
    type: "rule_violation",
    payload: {
      schemaVersion: 1,
      invariantId: "INV-003",
      logicalActionId: "act_cancel_1",
      sequence: 3,
      message:
        "Unique item relic-001 has two live locations (player-a and player-b)",
      preStateHash: PRE_HASH,
      postStateHash: POST_HASH,
    },
  }),
  CampaignEventSchema.parse({
    schemaVersion: 1,
    eventId: "evt_010",
    campaignId: CAMPAIGN_ID,
    sequence: 10,
    timestamp: "2026-09-15T20:00:01.400Z",
    mode: "scripted",
    type: "campaign_state",
    payload: { status: "stopped", stopRequested: true },
  }),
];

export const mockFinding: Finding = FindingSchema.parse({
  schemaVersion: 1,
  findingId: FINDING_ID,
  campaignId: CAMPAIGN_ID,
  status: "confirmed",
  mode: "scripted",
  violation: {
    schemaVersion: 1,
    invariantId: "INV-003",
    logicalActionId: "act_cancel_1",
    sequence: 3,
    message:
      "Unique item relic-001 has two live locations (player-a and player-b)",
    preStateHash: PRE_HASH,
    postStateHash: POST_HASH,
  },
  targetId: FAULTY_TARGET_ID,
  rulePackVersion: APPROVED_RULE_PACK_V1.version,
});

export const mockReplay: ReplayResult = ReplayResultSchema.parse({
  schemaVersion: 1,
  findingId: FINDING_ID,
  targetId: FAULTY_TARGET_ID,
  outcome: "matched_violation",
  message: "Fresh replay reproduced INV-003 on the faulty target",
  finalStateHash: POST_HASH,
});

export const mockLimitations = [
  "Synthetic economy only — not a live game server",
  "Scripted driver path; live AgenC explorers not yet attached",
  "Schema-valid mocks only — no live campaign stream (RB-008) or replay executor (RB-009)",
] as const;

/** Summarize a campaign event for the timeline list. */
export function summarizeEvent(event: CampaignEvent): {
  actorLabel: string;
  summary: string;
} {
  switch (event.type) {
    case "campaign_state":
      return {
        actorLabel: "system",
        summary: `Campaign status → ${event.payload.status}${
          event.payload.stopRequested ? " (stop requested)" : ""
        }`,
      };
    case "agent_status":
      return {
        actorLabel: event.payload.actorId,
        summary: `Agent status → ${event.payload.status}`,
      };
    case "action_submitted":
      return {
        actorLabel: event.payload.actorId,
        summary: `Submitted ${event.payload.kind} (${event.payload.logicalActionId})`,
      };
    case "action_completed":
      return {
        actorLabel: "system",
        summary: `Completed ${event.payload.logicalActionId}: ${event.payload.outcome}${
          event.payload.message ? ` — ${event.payload.message}` : ""
        }`,
      };
    case "rule_violation":
      return {
        actorLabel: "system",
        summary: `${event.payload.invariantId}: ${event.payload.message}`,
      };
    case "replay_result":
      return {
        actorLabel: "system",
        summary: `Replay ${event.payload.outcome}${
          event.payload.message ? ` — ${event.payload.message}` : ""
        }`,
      };
    case "budget_update":
      return {
        actorLabel: "system",
        summary: `Budget update (tools=${event.payload.toolCalls ?? "—"}, mutations=${
          event.payload.mutations ?? "—"
        })`,
      };
    case "system_error":
      return {
        actorLabel: "system",
        summary: `${event.payload.code}: ${event.payload.message}`,
      };
    default: {
      const _exhaustive: never = event;
      return { actorLabel: "system", summary: String(_exhaustive) };
    }
  }
}
