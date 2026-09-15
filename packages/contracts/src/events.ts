import { z } from "zod";
import { ActionResultSchema } from "./actions.js";
import { FindingSchema, ProvenanceModeSchema, ReplayResultSchema } from "./records.js";
import { InvariantViolationSchema } from "./rules.js";
import {
  CampaignIdSchema,
  EventIdSchema,
  SchemaVersionSchema,
} from "./primitives.js";

export const EventTypeSchema = z.enum([
  "campaign_state",
  "agent_status",
  "action_submitted",
  "action_completed",
  "rule_violation",
  "replay_result",
  "budget_update",
  "system_error",
]);
export type EventType = z.infer<typeof EventTypeSchema>;

const EventBase = z.object({
  schemaVersion: SchemaVersionSchema,
  eventId: EventIdSchema,
  campaignId: CampaignIdSchema,
  sequence: z.number().int().nonnegative(),
  /** Operational wall-clock ISO string — not used for domain determinism. */
  timestamp: z.string().min(1).max(64),
  mode: ProvenanceModeSchema,
});

export const CampaignEventSchema = z.discriminatedUnion("type", [
  EventBase.extend({
    type: z.literal("campaign_state"),
    payload: z.object({
      status: z.string().min(1).max(64),
      stopRequested: z.boolean().optional(),
    }),
  }),
  EventBase.extend({
    type: z.literal("agent_status"),
    payload: z.object({
      actorId: z.string().min(1).max(64),
      status: z.string().min(1).max(64),
    }),
  }),
  EventBase.extend({
    type: z.literal("action_submitted"),
    payload: z.object({
      logicalActionId: z.string().min(1).max(128),
      kind: z.string().min(1).max(64),
      actorId: z.string().min(1).max(64),
    }),
  }),
  EventBase.extend({
    type: z.literal("action_completed"),
    payload: ActionResultSchema,
  }),
  EventBase.extend({
    type: z.literal("rule_violation"),
    payload: InvariantViolationSchema,
  }),
  EventBase.extend({
    type: z.literal("replay_result"),
    payload: ReplayResultSchema,
  }),
  EventBase.extend({
    type: z.literal("budget_update"),
    payload: z.object({
      toolCalls: z.number().int().nonnegative().optional(),
      mutations: z.number().int().nonnegative().optional(),
      remainingSeconds: z.number().nonnegative().optional(),
    }),
  }),
  EventBase.extend({
    type: z.literal("system_error"),
    payload: z.object({
      code: z.string().min(1).max(64),
      message: z.string().min(1).max(500),
    }),
  }),
]);
export type CampaignEvent = z.infer<typeof CampaignEventSchema>;

/** Finding is validated separately; keep event payloads free of secrets/raw exceptions. */
export const FindingEventHintSchema = FindingSchema.pick({
  findingId: true,
  status: true,
  campaignId: true,
});
