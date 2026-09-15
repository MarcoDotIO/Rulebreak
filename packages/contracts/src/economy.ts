import { z } from "zod";
import {
  BoundedNonNegativeIntSchema,
  BoundedPositiveIntSchema,
  ItemIdSchema,
  PlayerIdSchema,
  TradeIdSchema,
} from "./primitives.js";

/** Inventory/escrow as occurrence lists so duplicate locations remain representable. */
export const ItemOccurrenceSchema = z.object({
  itemId: ItemIdSchema,
  location: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("player"), playerId: PlayerIdSchema }),
    z.object({ kind: z.literal("escrow"), tradeId: TradeIdSchema }),
  ]),
});
export type ItemOccurrence = z.infer<typeof ItemOccurrenceSchema>;

export const PlayerViewSchema = z.object({
  playerId: PlayerIdSchema,
  currency: BoundedNonNegativeIntSchema,
  inventoryItemIds: z.array(ItemIdSchema),
});
export type PlayerView = z.infer<typeof PlayerViewSchema>;

export const TradeStatusSchema = z.enum(["open", "accepted", "cancelled"]);
export type TradeStatus = z.infer<typeof TradeStatusSchema>;

export const TradeRecordSchema = z.object({
  tradeId: TradeIdSchema,
  sellerId: PlayerIdSchema,
  buyerId: PlayerIdSchema,
  itemId: ItemIdSchema,
  price: BoundedPositiveIntSchema,
  status: TradeStatusSchema,
});
export type TradeRecord = z.infer<typeof TradeRecordSchema>;

export const WorldStateSchema = z.object({
  schemaVersion: z.literal(1),
  balances: z.record(PlayerIdSchema, BoundedNonNegativeIntSchema),
  itemOccurrences: z.array(ItemOccurrenceSchema),
  trades: z.array(TradeRecordSchema),
  nextTradeSeq: BoundedNonNegativeIntSchema,
  virtualClock: BoundedNonNegativeIntSchema,
  seed: z.string().min(1).max(128),
});
export type WorldState = z.infer<typeof WorldStateSchema>;

export const InitialWorldSchema = z.object({
  schemaVersion: z.literal(1),
  players: z.tuple([PlayerIdSchema, PlayerIdSchema]),
  startingCurrency: BoundedNonNegativeIntSchema,
  uniqueItemId: ItemIdSchema,
  ownerId: PlayerIdSchema,
  seed: z.string().min(1).max(128),
});
export type InitialWorld = z.infer<typeof InitialWorldSchema>;

/** Default charter world (AGENTS.md §6 / AC-01). */
export const DEFAULT_INITIAL_WORLD: InitialWorld = {
  schemaVersion: 1,
  players: ["player-a", "player-b"],
  startingCurrency: 100,
  uniqueItemId: "relic-001",
  ownerId: "player-a",
  seed: "rulebreak-v0-default",
};
