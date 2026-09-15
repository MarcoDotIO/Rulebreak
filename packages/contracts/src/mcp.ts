import { z } from "zod";
import {
  EconomyObserveParamsSchema,
  StrategyNoteParamsSchema,
  TradeAcceptParamsSchema,
  TradeCancelParamsSchema,
  TradeCreateParamsSchema,
} from "./actions.js";
import { assertNoAuthorityFields } from "./primitives.js";

export const ExplorerToolNameSchema = z.enum([
  "economy_observe",
  "trade_create",
  "trade_accept",
  "trade_cancel",
  "strategy_note",
]);
export type ExplorerToolName = z.infer<typeof ExplorerToolNameSchema>;

const toolParamSchemas = {
  economy_observe: EconomyObserveParamsSchema,
  trade_create: TradeCreateParamsSchema,
  trade_accept: TradeAcceptParamsSchema,
  trade_cancel: TradeCancelParamsSchema,
  strategy_note: StrategyNoteParamsSchema,
} as const;

/**
 * Parse explorer-supplied MCP args. Rejects authority fields before schema parse.
 * campaignId/actorId must be injected by the trusted bridge after this returns.
 */
export function parseExplorerToolArgs(
  tool: ExplorerToolName,
  raw: unknown,
):
  | { ok: true; params: z.infer<(typeof toolParamSchemas)[ExplorerToolName]> }
  | { ok: false; error: string } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "arguments must be an object" };
  }
  const authority = assertNoAuthorityFields(raw as Record<string, unknown>);
  if (!authority.ok) {
    return { ok: false, error: `authority field rejected: ${authority.field}` };
  }
  const parsed = toolParamSchemas[tool].safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  return { ok: true, params: parsed.data };
}
