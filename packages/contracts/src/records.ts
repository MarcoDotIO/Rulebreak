import { z } from "zod";
import { ActionEnvelopeSchema, ActionResultSchema } from "./actions.js";
import { WorldStateSchema } from "./economy.js";
import { InvariantViolationSchema, RulePackSchema } from "./rules.js";
import {
  CampaignIdSchema,
  FindingIdSchema,
  SchemaVersionSchema,
  StateHashSchema,
} from "./primitives.js";

export const ProvenanceModeSchema = z.enum(["live", "scripted", "recorded"]);
export type ProvenanceMode = z.infer<typeof ProvenanceModeSchema>;

export const CampaignStatusSchema = z.enum([
  "pending",
  "running",
  "stopped",
  "completed",
  "failed",
]);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const FindingStatusSchema = z.enum([
  "candidate",
  "confirmed",
  "not_reproduced",
  "inconclusive",
]);
export type FindingStatus = z.infer<typeof FindingStatusSchema>;

export const TargetFixtureModeSchema = z.enum(["fixed", "faulty"]);
export type TargetFixtureMode = z.infer<typeof TargetFixtureModeSchema>;

export const TargetManifestSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  targetId: z.string().min(1).max(128),
  displayName: z.string().min(1).max(128),
  fixtureMode: TargetFixtureModeSchema,
  buildId: z.string().min(1).max(128),
  publicContractVersion: z.literal(1),
});
export type TargetManifest = z.infer<typeof TargetManifestSchema>;

export const CampaignSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  campaignId: CampaignIdSchema,
  status: CampaignStatusSchema,
  mode: ProvenanceModeSchema,
  targetId: z.string().min(1).max(128),
  rulePackId: z.string().min(1).max(128),
  createdAt: z.string().min(1).max(64),
  stopRequested: z.boolean(),
});
export type Campaign = z.infer<typeof CampaignSchema>;

export const StateSnapshotSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  campaignId: CampaignIdSchema,
  sequence: z.number().int().nonnegative(),
  stateHash: StateHashSchema,
  world: WorldStateSchema,
});
export type StateSnapshot = z.infer<typeof StateSnapshotSchema>;

export const FindingSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  findingId: FindingIdSchema,
  campaignId: CampaignIdSchema,
  status: FindingStatusSchema,
  mode: ProvenanceModeSchema,
  violation: InvariantViolationSchema,
  targetId: z.string().min(1).max(128),
  rulePackVersion: z.string().min(1).max(64),
});
export type Finding = z.infer<typeof FindingSchema>;

export const ReplayResultSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  findingId: FindingIdSchema,
  targetId: z.string().min(1).max(128),
  outcome: z.enum(["matched_violation", "diverged", "blocked_as_expected", "error"]),
  message: z.string().max(1000).optional(),
  finalStateHash: StateHashSchema.optional(),
});
export type ReplayResult = z.infer<typeof ReplayResultSchema>;

export const UsageLedgerSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  campaignId: CampaignIdSchema,
  toolCalls: z.number().int().nonnegative(),
  mutations: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative().finite().optional(),
  elapsedSeconds: z.number().nonnegative().finite().optional(),
});
export type UsageLedger = z.infer<typeof UsageLedgerSchema>;

export const PersistedActionSchema = z.object({
  envelope: ActionEnvelopeSchema,
  result: ActionResultSchema,
  preStateHash: StateHashSchema,
  postStateHash: StateHashSchema.optional(),
});
export type PersistedAction = z.infer<typeof PersistedActionSchema>;

export { RulePackSchema, ActionEnvelopeSchema, ActionResultSchema, WorldStateSchema };
