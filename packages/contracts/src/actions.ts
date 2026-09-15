import { z } from "zod";
import {
  BoundedPositiveIntSchema,
  CampaignIdSchema,
  ItemIdSchema,
  LogicalActionIdSchema,
  PlayerIdSchema,
  SCHEMA_VERSION,
  SchemaVersionSchema,
  TradeIdSchema,
  TransportDispatchIdSchema,
} from "./primitives.js";

export const ActionKindSchema = z.enum([
  "trade_create",
  "trade_accept",
  "trade_cancel",
  "economy_observe",
  "strategy_note",
]);
export type ActionKind = z.infer<typeof ActionKindSchema>;

export const TradeCreateParamsSchema = z
  .object({
    itemId: ItemIdSchema,
    counterpartyId: PlayerIdSchema,
    price: BoundedPositiveIntSchema,
  })
  .strict();

export const TradeAcceptParamsSchema = z
  .object({
    tradeId: TradeIdSchema,
  })
  .strict();

export const TradeCancelParamsSchema = z
  .object({
    tradeId: TradeIdSchema,
  })
  .strict();

export const EconomyObserveParamsSchema = z
  .object({
    view: z.enum(["self", "public"]).optional(),
  })
  .strict();

export const StrategyNoteParamsSchema = z
  .object({
    text: z.string().min(1).max(500),
    observedActionIds: z.array(LogicalActionIdSchema).max(16).optional(),
  })
  .strict();

export const ActionParamsSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("trade_create"), params: TradeCreateParamsSchema }),
  z.object({ kind: z.literal("trade_accept"), params: TradeAcceptParamsSchema }),
  z.object({ kind: z.literal("trade_cancel"), params: TradeCancelParamsSchema }),
  z.object({ kind: z.literal("economy_observe"), params: EconomyObserveParamsSchema }),
  z.object({ kind: z.literal("strategy_note"), params: StrategyNoteParamsSchema }),
]);

/**
 * Trusted envelope: actor/campaign come from the binding, never from explorer args.
 * Callers must populate actorId/campaignId from the trusted bridge only.
 */
export const ActionEnvelopeSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  campaignId: CampaignIdSchema,
  worldId: z.string().min(1).max(128),
  actorId: PlayerIdSchema,
  logicalActionId: LogicalActionIdSchema,
  transportDispatchId: TransportDispatchIdSchema,
  kind: ActionKindSchema,
  params: z.unknown(),
  virtualTime: z.number().int().nonnegative().optional(),
}).superRefine((val, ctx) => {
  const byKind = {
    trade_create: TradeCreateParamsSchema,
    trade_accept: TradeAcceptParamsSchema,
    trade_cancel: TradeCancelParamsSchema,
    economy_observe: EconomyObserveParamsSchema,
    strategy_note: StrategyNoteParamsSchema,
  } as const;
  const parsed = byKind[val.kind].safeParse(val.params);
  if (!parsed.success) {
    ctx.addIssue({
      code: "custom",
      message: `params invalid for ${val.kind}: ${parsed.error.message}`,
      path: ["params"],
    });
  }
});
export type ActionEnvelope = z.infer<typeof ActionEnvelopeSchema>;

export const ActionOutcomeKindSchema = z.enum([
  "accepted",
  "domain_rejected",
  "policy_denied",
  "transport_failure",
  "target_error",
]);
export type ActionOutcomeKind = z.infer<typeof ActionOutcomeKindSchema>;

export const ActionResultSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  logicalActionId: LogicalActionIdSchema,
  transportDispatchId: TransportDispatchIdSchema,
  outcome: ActionOutcomeKindSchema,
  domainCode: z.string().min(1).max(64).optional(),
  message: z.string().max(500).optional(),
  sequence: z.number().int().nonnegative().optional(),
});
export type ActionResult = z.infer<typeof ActionResultSchema>;

export const DEFAULT_SCHEMA_VERSION = SCHEMA_VERSION;
