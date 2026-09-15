import type { CampaignEvent } from "@rulebreak/contracts";

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
