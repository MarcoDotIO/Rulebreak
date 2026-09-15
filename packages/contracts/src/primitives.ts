import { z } from "zod";

/** Schema version for all V1 domain contracts. */
export const SCHEMA_VERSION = 1 as const;

/** Soft project bound for currency/prices (AGENTS.md §6) — not an industry standard. */
export const MAX_CURRENCY = 1_000_000_000;

export const SchemaVersionSchema = z.literal(SCHEMA_VERSION);

export const BoundedNonNegativeIntSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_CURRENCY)
  .finite();

export const BoundedPositiveIntSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_CURRENCY)
  .finite();

export const PlayerIdSchema = z.enum(["player-a", "player-b"]);
export type PlayerId = z.infer<typeof PlayerIdSchema>;

export const ItemIdSchema = z.string().min(1).max(128);
export const TradeIdSchema = z.string().min(1).max(128);
export const CampaignIdSchema = z.string().min(1).max(128);
export const LogicalActionIdSchema = z.string().min(1).max(128);
export const TransportDispatchIdSchema = z.string().min(1).max(128);
export const FindingIdSchema = z.string().min(1).max(128);
export const EventIdSchema = z.string().min(1).max(128);
export const StateHashSchema = z.string().min(1).max(128);

/** Fields that must never grant authority when supplied by explorers. */
export const REJECTED_AUTHORITY_FIELDS = [
  "actorId",
  "campaignId",
  "capabilityToken",
  "targetUrl",
  "filePath",
  "fixtureMode",
] as const;

export function assertNoAuthorityFields(
  value: Record<string, unknown>,
): { ok: true } | { ok: false; field: string } {
  for (const field of REJECTED_AUTHORITY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(value, field)) {
      return { ok: false, field };
    }
  }
  return { ok: true };
}
