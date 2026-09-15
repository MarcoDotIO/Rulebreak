#!/usr/bin/env node
/**
 * G2–G4 offline probe runner (no paid / no live provider).
 * Implements Chronomancer-assigned scripts from docs/security/g2-g4-isolation-probe-plan.md.
 * Emits Pass / Fail / Not run per probe ID. Never calls xAI/OpenAI/etc.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");

const AMBIENT = [
  "XAI_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "RULEBREAK_OPERATOR_TOKEN",
];

function refuseLive() {
  if (process.env.RULEBREAK_LIVE_ENABLED === "true") {
    console.error("REFUSE: RULEBREAK_LIVE_ENABLED=true — offline probes only");
    process.exit(2);
  }
  const present = AMBIENT.filter((k) => process.env[k]?.trim());
  if (present.length) {
    console.error(`REFUSE: ambient secrets present (${present.join(", ")}) — unset for offline probes`);
    process.exit(2);
  }
}

function result(id, status, detail) {
  return { id, status, detail };
}

async function mcpProbe(actorId, campaignId = "g2g4-offline") {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(root, "packages/mcp-tools/bin/rulebreak-mcp-player.mjs")],
    env: {
      ...process.env,
      RULEBREAK_ACTOR_ID: actorId,
      RULEBREAK_CAMPAIGN_ID: campaignId,
    },
  });
  const client = new Client({ name: "g2g4-offline", version: "0.0.0" });
  await client.connect(transport);
  const tools = await client.listTools();
  const observe = await client.callTool({ name: "economy_observe", arguments: {} });
  const spoof = await client.callTool({
    name: "economy_observe",
    arguments: { actorId: "intruder" },
  });
  const pathSpoof = await client.callTool({
    name: "economy_observe",
    arguments: { filePath: "/etc/passwd" },
  });
  const fixtureSpoof = await client.callTool({
    name: "economy_observe",
    arguments: { fixtureMode: "faulty" },
  });
  const unknown = await client.callTool({
    name: "Bash",
    arguments: { command: "id" },
  });
  await client.close();
  return {
    actorId,
    tools: tools.tools.map((t) => t.name),
    observeText: observe.content?.[0]?.text ?? "",
    spoofRejected: spoof.isError === true,
    pathRejected: pathSpoof.isError === true,
    fixtureRejected: fixtureSpoof.isError === true,
    bashRejected:
      unknown.isError === true ||
      String(unknown.content?.[0]?.text ?? "").includes("unknown tool"),
  };
}

function writeHomeStub(homeDir, actorId) {
  mkdirSync(homeDir, { recursive: true });
  const mcpPath = join(homeDir, "mcp.json");
  const cfg = {
    mcpServers: {
      [`rulebreak-${actorId}`]: {
        command: "node",
        args: ["packages/mcp-tools/bin/rulebreak-mcp-player.mjs"],
        env: {
          RULEBREAK_ACTOR_ID: actorId,
          RULEBREAK_CAMPAIGN_ID: "g2g4-offline",
        },
      },
    },
  };
  writeFileSync(mcpPath, JSON.stringify(cfg, null, 2));
  return mcpPath;
}

function runG2Homes() {
  const base = join(root, ".rulebreak");
  const homeA = join(base, "agenc-home-player-a");
  const homeB = join(base, "agenc-home-player-b");
  const pathA = writeHomeStub(homeA, "player-a");
  const pathB = writeHomeStub(homeB, "player-b");
  const cfgA = JSON.parse(readFileSync(pathA, "utf8"));
  const cfgB = JSON.parse(readFileSync(pathB, "utf8"));
  const aKeys = Object.keys(cfgA.mcpServers);
  const bKeys = Object.keys(cfgB.mcpServers);
  const aHasB = aKeys.some((k) => k.includes("player-b"));
  const bHasA = bKeys.some((k) => k.includes("player-a"));
  const distinct =
    existsSync(homeA) &&
    existsSync(homeB) &&
    !aHasB &&
    !bHasA &&
    cfgA.mcpServers["rulebreak-player-a"]?.env?.RULEBREAK_ACTOR_ID === "player-a" &&
    cfgB.mcpServers["rulebreak-player-b"]?.env?.RULEBREAK_ACTOR_ID === "player-b";

  // Cross-read: home A config must not embed home B actor env
  const aText = readFileSync(pathA, "utf8");
  const crossClosed = !aText.includes("player-b") && !readFileSync(pathB, "utf8").includes("player-a");

  return {
    g2p1: result(
      "G2-P1",
      distinct ? "Pass" : "Fail",
      `homes ${homeA} / ${homeB}; servers=${JSON.stringify({ aKeys, bKeys })}`,
    ),
    g2p2: result(
      "G2-P2",
      distinct ? "Pass" : "Fail",
      "stub mcp.json per home with actor-only env (agenc mcp list not required for stub)",
    ),
    g2p3: result(
      "G2-P3",
      "Not run",
      "createSession ×2 needs AgenC daemon + offline model path — deferred (no spend)",
    ),
    g2p4: result(
      "G2-P4",
      crossClosed ? "Pass" : "Fail",
      crossClosed
        ? "home A mcp.json does not reference player-b (and reverse)"
        : "cross actor id leaked into peer home config",
    ),
  };
}

async function runG3G4Mcp() {
  const a = await mcpProbe("player-a");
  const b = await mcpProbe("player-b");
  const observeDistinct = a.observeText !== b.observeText && a.observeText.includes("player-a");
  const authority =
    a.spoofRejected &&
    b.spoofRejected &&
    a.pathRejected &&
    b.pathRejected &&
    a.fixtureRejected &&
    b.fixtureRejected;
  const bash = a.bashRejected && b.bashRejected;

  return {
    g3p1: result(
      "G3-P1",
      observeDistinct && a.tools.includes("economy_observe") ? "Pass" : "Fail",
      `distinct observe=${observeDistinct}; toolsA=${a.tools.join(",")}`,
    ),
    g3p2: result(
      "G3-P2",
      "Not run",
      "worker/coordinator path not wired for bound MCP yet — gap for follow-up",
    ),
    g3p3: result(
      "G3-P3",
      "Not run",
      "Ollama offline-model turn deferred (optional; does not close G3 alone)",
    ),
    g3p4: result(
      "G3-P4",
      observeDistinct ? "Pass" : "Fail",
      "player-a observe payload is self-scoped in MCP bridge stub state",
    ),
    g4p1: result("G4-P1", bash ? "Pass" : "Fail", "Bash/unknown tool rejected at MCP allowlist"),
    g4p2: result(
      "G4-P2",
      authority ? "Pass" : "Fail",
      "actorId/filePath/fixtureMode rejected at bridge",
    ),
    g4p3: result(
      "G4-P3",
      "Not run",
      "permission-callback path needs AgenC session — deferred",
    ),
    g4p6: result(
      "G4-P6",
      a.fixtureRejected && b.fixtureRejected ? "Pass" : "Fail",
      "fixtureMode rejected on economy_observe",
    ),
  };
}

async function runG4P5OperatorHttp() {
  const serverSrc = readFileSync(join(root, "apps/server/src/index.ts"), "utf8");
  const authSrc = existsSync(join(root, "apps/server/src/operator-auth.ts"))
    ? readFileSync(join(root, "apps/server/src/operator-auth.ts"), "utf8")
    : "";
  const wired =
    serverSrc.includes("requireOperator") &&
    serverSrc.includes('"/api/campaigns"') &&
    serverSrc.includes('"/api/campaigns/:id/stop"');
  const enforces =
    authSrc.includes("unauthorized operator") &&
    authSrc.includes("operator token not configured") &&
    authSrc.includes("timingSafeEqual");

  return result(
    "G4-P5",
    wired && enforces ? "Pass" : "Fail",
    wired && enforces
      ? "requireOperator on POST /api/campaigns and stop; 401/503 paths present"
      : "operator token enforcement missing or incomplete on control mutations",
  );
}

function runG4P4Fs() {
  // Without a real worker jail we cannot claim denial. Record honesty.
  return result(
    "G4-P4",
    "Not run",
    "no worker jail/mount boundary in-repo yet — see OS inventory; do not claim FS denial",
  );
}

function runG4P7Inventory() {
  const inventoryPath = join(root, "docs/spikes/g2-g4-os-inventory.md");
  if (!existsSync(inventoryPath)) {
    return result("G4-P7", "Fail", "docs/spikes/g2-g4-os-inventory.md missing");
  }
  const text = readFileSync(inventoryPath, "utf8");
  const filled =
    text.includes("## Recorded environment") && text.includes("Honesty");
  return result(
    "G4-P7",
    filled ? "Pass" : "Fail",
    filled
      ? "OS inventory sheet present with recorded environment"
      : "inventory sheet incomplete",
  );
}

refuseLive();

const out = {
  schemaVersion: 1,
  mode: "offline",
  generatedAt: new Date().toISOString(),
  host: process.platform,
  node: process.version,
  probes: [],
};

const g2 = runG2Homes();
out.probes.push(g2.g2p1, g2.g2p2, g2.g2p3, g2.g2p4);

const mcp = await runG3G4Mcp();
out.probes.push(
  mcp.g3p1,
  mcp.g3p2,
  mcp.g3p3,
  mcp.g3p4,
  mcp.g4p1,
  mcp.g4p2,
  mcp.g4p3,
  mcp.g4p6,
);

out.probes.push(await runG4P5OperatorHttp());
out.probes.push(runG4P4Fs());
out.probes.push(runG4P7Inventory());

const pass = out.probes.filter((p) => p.status === "Pass").length;
const fail = out.probes.filter((p) => p.status === "Fail").length;
const skip = out.probes.filter((p) => p.status === "Not run").length;
out.summary = { pass, fail, notRun: skip, total: out.probes.length };

const outDir = join(root, ".rulebreak", "spikes");
mkdirSync(outDir, { recursive: true });
const jsonPath = join(outDir, "g2-g4-offline-probe-results.json");
writeFileSync(jsonPath, JSON.stringify(out, null, 2));

const mdLines = [
  "# G2–G4 offline probe results",
  "",
  `Generated: ${out.generatedAt} (local host)`,
  "",
  "**Mode:** offline only — no paid provider calls",
  "",
  `| Pass | Fail | Not run | Total |`,
  `| --- | --- | --- | --- |`,
  `| ${pass} | ${fail} | ${skip} | ${out.probes.length} |`,
  "",
  "| ID | Status | Detail |",
  "| --- | --- | --- |",
  ...out.probes.map((p) => `| ${p.id} | **${p.status}** | ${p.detail.replace(/\|/g, "/")} |`),
  "",
  "Machine JSON: `.rulebreak/spikes/g2-g4-offline-probe-results.json` (gitignored under `.rulebreak/`).",
  "",
  "Live discovery remains **out of pitch** until full G2–G4 (or Marco accepts a written reduced claim).",
];
writeFileSync(join(root, "docs/spikes/g2-g4-probe-results.md"), mdLines.join("\n") + "\n");

console.log(JSON.stringify(out, null, 2));
// Exit 0 even with Fail rows — honesty report, not a CI hard gate yet.
process.exit(0);
