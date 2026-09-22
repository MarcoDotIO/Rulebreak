#!/usr/bin/env node
/**
 * Actor-scoped MCP bridge.
 * Authority from RULEBREAK_* env only. Rejects RB-004 authority fields including filePath/fixtureMode.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const actorId = process.env.RULEBREAK_ACTOR_ID?.trim();
const campaignId = process.env.RULEBREAK_CAMPAIGN_ID?.trim() || "spike";
if (!actorId) {
  console.error("RULEBREAK_ACTOR_ID is required");
  process.exit(1);
}

/** Keep in sync with @rulebreak/contracts REJECTED_AUTHORITY_FIELDS until the bridge is TypeScript. */
const FORBIDDEN_AUTHORITY = new Set([
  "actorId",
  "campaignId",
  "capabilityToken",
  "targetUrl",
  "filePath",
  "fixtureMode",
]);

const ALLOWED_TOOLS = new Set([
  "economy_observe",
  "trade_create",
  "trade_accept",
  "trade_cancel",
  "strategy_note",
]);

const TOOLS = [
  {
    name: "economy_observe",
    description: "Observe the bound player's public view",
    // Eager-load in AgenC sessions (otherwise deferred until system.searchTools select:).
    _meta: { "anthropic/alwaysLoad": true },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { view: { type: "string", enum: ["self", "public"] } },
    },
  },
  {
    name: "trade_create",
    _meta: { "anthropic/alwaysLoad": true },
    description: "Create an escrow-backed trade as the bound actor",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["itemId", "counterpartyId", "price"],
      properties: {
        itemId: { type: "string" },
        counterpartyId: { type: "string" },
        price: { type: "integer", exclusiveMinimum: 0 },
      },
    },
  },
  {
    name: "trade_accept",
    _meta: { "anthropic/alwaysLoad": true },
    description: "Accept a trade as the bound actor",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["tradeId"],
      properties: { tradeId: { type: "string" } },
    },
  },
  {
    name: "trade_cancel",
    _meta: { "anthropic/alwaysLoad": true },
    description: "Cancel a trade as the bound actor",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["tradeId"],
      properties: { tradeId: { type: "string" } },
    },
  },
  {
    name: "strategy_note",
    _meta: { "anthropic/alwaysLoad": true },
    description: "Write a short shared strategy note",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: { text: { type: "string", maxLength: 500 } },
    },
  },
];

const state = {
  players: {
    "player-a": { currency: 100, inventory: ["relic-001"] },
    "player-b": { currency: 100, inventory: [] },
  },
};

function rejectAuthority(args) {
  if (!args || typeof args !== "object") return null;
  for (const key of Object.keys(args)) {
    if (FORBIDDEN_AUTHORITY.has(key)) return `authority field rejected: ${key}`;
  }
  return null;
}

const server = new Server(
  { name: `rulebreak-mcp-${actorId}`, version: "0.0.1" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = request.params.arguments ?? {};
  const authorityError = rejectAuthority(args);
  if (authorityError) {
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ ok: false, error: authorityError }) }],
    };
  }
  if (!ALLOWED_TOOLS.has(name)) {
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ ok: false, error: `unknown tool: ${name}` }) }],
    };
  }
  if (name === "economy_observe") {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          campaignId,
          actorId,
          view: args.view ?? "self",
          self: state.players[actorId] ?? null,
          publicTrades: [],
        }),
      }],
    };
  }
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        ok: true,
        campaignId,
        actorId,
        action: name,
        args,
        note: "spike stub — real economy lands in RB-006",
      }),
    }],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
