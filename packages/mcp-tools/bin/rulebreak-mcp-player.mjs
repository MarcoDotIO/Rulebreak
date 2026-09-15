#!/usr/bin/env node
/**
 * Actor-scoped MCP bridge for RB-003 spike.
 * Authority comes from RULEBREAK_ACTOR_ID env set by the trusted launcher — never from tool args.
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

const FORBIDDEN_AUTHORITY = new Set([
  "actorId",
  "campaignId",
  "capabilityToken",
  "targetUrl",
]);

const TOOLS = [
  {
    name: "economy_observe",
    description: "Observe the bound player's public view",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        view: { type: "string", enum: ["self", "public"] },
      },
    },
  },
  {
    name: "trade_create",
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
    if (FORBIDDEN_AUTHORITY.has(key)) {
      return `authority field rejected: ${key}`;
    }
  }
  return null;
}

const server = new Server(
  { name: `rulebreak-mcp-${actorId}`, version: "0.0.0-spike" },
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
  if (!TOOLS.some((t) => t.name === name)) {
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ ok: false, error: `unknown tool: ${name}` }) }],
    };
  }

  if (name === "economy_observe") {
    const me = state.players[actorId] ?? null;
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          campaignId,
          actorId,
          view: args.view ?? "self",
          self: me,
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
