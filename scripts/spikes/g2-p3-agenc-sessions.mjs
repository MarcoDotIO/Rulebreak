#!/usr/bin/env node
/**
 * G2-P3: real AgenC sessions on separate AGENC_HOMEs (Ollama only, no spend).
 * Uses SDK createSession path (spawnAgent + attach) against installed pin.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  connect,
  resolveAgencHome,
  resolveDaemonSocketPath,
} from "@tetsuo-ai/agenc-sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const ACTORS = ["player-a", "player-b"];
const MODEL = process.env.RULEBREAK_OLLAMA_MODEL || "llama3.2";
const PROVIDER = "ollama";
const agencBin = join(root, "node_modules", ".bin", "agenc");

function refuseLive() {
  if (process.env.RULEBREAK_LIVE_ENABLED === "true") {
    console.error("REFUSE: RULEBREAK_LIVE_ENABLED=true");
    process.exit(2);
  }
  for (const k of ["XAI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY"]) {
    if (process.env[k]?.trim()) {
      console.error(`REFUSE: ambient ${k} set — unset for offline G2-P3`);
      process.exit(2);
    }
  }
}

function ensureHome(actorId) {
  const homeDir = join(root, ".rulebreak", `agenc-home-${actorId}`);
  mkdirSync(homeDir, { recursive: true });
  const mcpPath = join(homeDir, "mcp.json");
  if (!existsSync(mcpPath)) {
    writeFileSync(
      mcpPath,
      JSON.stringify(
        {
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
        },
        null,
        2,
      ),
    );
  }
  return homeDir;
}

async function openSession(actorId) {
  const homeDir = ensureHome(actorId);
  const env = {
    ...process.env,
    AGENC_HOME: homeDir,
    // Strip paid provider keys even if parent leaked them
    XAI_API_KEY: "",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    GOOGLE_API_KEY: "",
  };
  const resolvedHome = resolveAgencHome(env);
  const socketPath = resolveDaemonSocketPath(env);
  const client = await connect({
    env,
    autostart: true,
    agencCommand: agencBin,
    clientName: `rulebreak-g2-p3-${actorId}`,
    readyTimeoutMs: 90_000,
  });
  // Documented 0.17 path: createSession prefers agent.create then attach.
  // Pass provider/model via spawnAgent (createSession itself does not forward them).
  const agent = await client.spawnAgent({
    objective: `G2-P3 isolation probe for ${actorId} (no spend)`,
    cwd: root,
    provider: PROVIDER,
    model: MODEL,
    permissionMode: "plan",
    initialContent: [],
  });
  const attached = await client.attachAgent(agent.agentId);
  let session = attached.session;
  if (session === null) {
    session = await client.createSession({ agentId: agent.agentId, cwd: root });
  }
  return {
    actorId,
    homeDir,
    resolvedHome,
    socketPath,
    agentId: agent.agentId,
    sessionId: session.sessionId,
    api: {
      connect: "connect({ env: { AGENC_HOME }, agencCommand, autostart })",
      spawnAgent: "client.spawnAgent({ provider, model, cwd, objective })",
      attachAgent: "client.attachAgent(agentId)",
      createSessionFallback: "client.createSession({ agentId, cwd })",
      resolveAgencHome: "resolveAgencHome(env)",
      resolveDaemonSocketPath: "resolveDaemonSocketPath(env)",
    },
    provider: PROVIDER,
    model: MODEL,
    client,
    session,
    agentIdForStop: agent.agentId,
  };
}

async function main() {
  refuseLive();
  const opened = [];
  const errors = [];
  try {
    for (const actorId of ACTORS) {
      try {
        const row = await openSession(actorId);
        opened.push(row);
        console.log(
          `OK ${actorId}: session=${row.sessionId} agent=${row.agentId} home=${row.resolvedHome}`,
        );
      } catch (err) {
        errors.push({ actorId, message: String(err?.message ?? err) });
        console.error(`FAIL ${actorId}:`, err);
      }
    }

    const homes = opened.map((o) => o.resolvedHome);
    const sockets = opened.map((o) => o.socketPath);
    const sessions = opened.map((o) => o.sessionId);
    const distinctHomes = new Set(homes).size === homes.length && homes.length === 2;
    const distinctSockets = new Set(sockets).size === sockets.length && sockets.length === 2;
    const distinctSessions =
      new Set(sessions).size === sessions.length && sessions.length === 2;
    const homesMatchActors = opened.every(
      (o) =>
        o.resolvedHome === o.homeDir &&
        o.resolvedHome.includes(`agenc-home-${o.actorId}`),
    );

    const pass =
      errors.length === 0 &&
      distinctHomes &&
      distinctSockets &&
      distinctSessions &&
      homesMatchActors;

    const artifact = {
      probe: "G2-P3",
      status: pass ? "Pass" : "Fail",
      generatedAt: new Date().toISOString(),
      sdkPin: "@tetsuo-ai/agenc-sdk file:./vendor/agenc-sdk-0.3.0-v017",
      cliPin: "@tetsuo-ai/agenc@0.17.0",
      provider: PROVIDER,
      model: MODEL,
      spend: "none — Ollama local only; no prompt turn",
      criteria: {
        twoSessionIds: distinctSessions,
        eachEnvPointsAtOwnHome: homesMatchActors && distinctHomes,
        distinctDaemonSockets: distinctSockets,
      },
      sessions: opened.map((o) => ({
        actorId: o.actorId,
        sessionId: o.sessionId,
        agentId: o.agentId,
        resolvedHome: o.resolvedHome,
        socketPath: o.socketPath,
        api: o.api,
      })),
      errors,
    };

    const outPath = join(root, "docs/spikes/g2-p3-session-artifact.json");
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n");
    console.log(JSON.stringify({ status: artifact.status, outPath, criteria: artifact.criteria }, null, 2));
    process.exitCode = pass ? 0 : 1;
  } finally {
    for (const o of opened) {
      try {
        await o.client.stopAgent(o.agentIdForStop, "g2-p3 cleanup");
      } catch {
        /* ignore */
      }
      try {
        // close transport if exposed — connect returns client; try dispose patterns
        if (typeof o.client.close === "function") await o.client.close();
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
