#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";

async function probe(actorId) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve("packages/mcp-tools/bin/rulebreak-mcp-player.mjs")],
    env: {
      ...process.env,
      RULEBREAK_ACTOR_ID: actorId,
      RULEBREAK_CAMPAIGN_ID: "spike-1",
    },
  });
  const client = new Client({ name: "rb003-direct", version: "0.0.0" });
  await client.connect(transport);
  const tools = await client.listTools();
  const observe = await client.callTool({ name: "economy_observe", arguments: {} });
  const spoof = await client.callTool({
    name: "economy_observe",
    arguments: { actorId: "intruder" },
  });
  const unknown = await client.callTool({
    name: "Bash",
    arguments: { command: "id" },
  });
  await client.close();
  return {
    actorId,
    tools: tools.tools.map((t) => t.name),
    observe: observe.content?.[0]?.text,
    spoofRejected: spoof.isError === true,
    bashRejected: unknown.isError === true || unknown.content?.[0]?.text?.includes("unknown tool"),
  };
}

const a = await probe("player-a");
const b = await probe("player-b");
const ok =
  a.spoofRejected &&
  b.spoofRejected &&
  a.bashRejected &&
  b.bashRejected &&
  a.observe !== b.observe &&
  a.tools.includes("economy_observe");
console.log(JSON.stringify({ ok, a, b }, null, 2));
process.exit(ok ? 0 : 1);
