#!/usr/bin/env node
/**
 * G3-P3: optional offline-model turn (Ollama only).
 * Prompt a bound AgenC session to call economy_observe; record tool trace.
 * Supporting evidence only — does not close G3 alone if flaky. No paid providers.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "@tetsuo-ai/agenc-sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const MODEL = process.env.RULEBREAK_OLLAMA_MODEL || "gemma4";
const PROVIDER = "ollama";
const ACTOR = "player-a";
const home = join(root, `.rulebreak/agenc-home-${ACTOR}`);
const agencBin = join(root, "node_modules", ".bin", "agenc");
const TURN_MS = Number(process.env.RULEBREAK_G3P3_TIMEOUT_MS || 180_000);
const outPath = join(root, "docs/spikes/g3-p3-ollama-artifact.json");

function refuseLive() {
  if (process.env.RULEBREAK_LIVE_ENABLED === "true") {
    console.error("REFUSE: RULEBREAK_LIVE_ENABLED=true");
    process.exit(2);
  }
  for (const k of ["XAI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY"]) {
    if (process.env[k]?.trim()) {
      console.error(`REFUSE: ambient ${k} set — unset for offline G3-P3`);
      process.exit(2);
    }
  }
}

function allowEconomyPermission(req) {
  const name = String(req.toolName || "");
  const perms = (req.permissions || []).join(" ");
  if (/bash|shell|exec|write|edit|remove|delete/i.test(name)) return false;
  return (
    /economy_observe|searchTools|rulebreak|mcp/i.test(name) ||
    /mcp|economy|tool/i.test(perms)
  );
}

function writeArtifact(artifact) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n");
  console.log(JSON.stringify({ status: artifact.status, outPath, criteria: artifact.criteria }, null, 2));
}

async function main() {
  refuseLive();
  if (!existsSync(home)) {
    console.error(`missing AGENC_HOME ${home} — run spike:g2-p3 / G2 homes first`);
    process.exit(1);
  }

  const callbackLog = [];
  const toolEvents = [];
  const env = {
    ...process.env,
    AGENC_HOME: home,
    XAI_API_KEY: "",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    GOOGLE_API_KEY: "",
  };

  const client = await connect({
    env,
    autostart: true,
    agencCommand: agencBin,
    clientName: "rulebreak-g3-p3",
    readyTimeoutMs: 90_000,
    onPermissionRequest: async (req) => {
      const allow = allowEconomyPermission(req);
      callbackLog.push({
        at: new Date().toISOString(),
        toolName: req.toolName,
        permissions: req.permissions,
        decision: allow ? "allow" : "deny",
      });
      if (allow) return { behavior: "allow", scope: "session" };
      return { behavior: "deny", reason: "G3-P3 deny non-economy tool" };
    },
  });

  let agentId;
  let session;
  let assistant = "";
  let transcript = null;
  try {
    const agent = await client.spawnAgent({
      objective: "Call MCP economy_observe once and report the result.",
      cwd: root,
      provider: PROVIDER,
      model: MODEL,
      permissionMode: "default",
      initialContent: [],
    });
    agentId = agent.agentId;
    const attached = await client.attachAgent(agentId);
    session = attached.session;
    if (session === null) {
      session = await client.createSession({ agentId, cwd: root });
    }

    const prompt = [
      "You have MCP server rulebreak-player-a with tool economy_observe.",
      "Call economy_observe now with empty arguments {}.",
      "Do not use Bash or shell. After the tool returns, reply with only the tool result text.",
    ].join(" ");

    const run = session.prompt(prompt, { includeUsage: false });
    const cancelTimer = setTimeout(() => {
      session.cancelTurn("g3-p3 timeout").catch(() => {});
    }, TURN_MS);

    try {
      for await (const ev of run) {
        if (ev.type === "tool_call" || ev.type === "permission_request") {
          toolEvents.push({
            type: ev.type,
            toolName: ev.toolName,
            requestId: ev.requestId,
            permissions: ev.permissions,
            input: ev.input,
          });
          console.log(ev.type, ev.toolName || "", ev.requestId || "");
        } else if (ev.type === "text" && ev.delta) {
          assistant += ev.delta;
        } else if (ev.type === "message_committed") {
          assistant = ev.text || assistant;
        } else if (ev.type === "error") {
          console.error("prompt event error:", ev);
          toolEvents.push({ type: "error", detail: ev });
        }
      }
    } catch (err) {
      console.error("prompt ended:", err?.message || err);
    } finally {
      clearTimeout(cancelTimer);
    }

    try {
      transcript = await session.transcriptV2();
    } catch {
      try {
        transcript = await session.transcript();
      } catch (err) {
        transcript = { error: String(err?.message || err) };
      }
    }
  } finally {
    const tStr = JSON.stringify(transcript ?? {});
    const aStr = assistant + tStr + JSON.stringify(toolEvents);
    const toolInvocationInTrace =
      toolEvents.some((e) => /economy_observe/i.test(String(e.toolName || ""))) ||
      /economy_observe/i.test(tStr);
    const resultMatchesBinding =
      /player-a/i.test(aStr) && !/player-b["\s]*inventory/i.test(aStr);
    const pass = toolInvocationInTrace;
    writeArtifact({
      probe: "G3-P3",
      status: pass ? "Pass" : "Fail",
      label: "offline-model",
      generatedAt: new Date().toISOString(),
      provider: PROVIDER,
      model: MODEL,
      spend: "none — Ollama local only",
      actorId: ACTOR,
      home,
      sessionId: session?.sessionId,
      agentId,
      callbackLog,
      toolEvents,
      assistantSnippet: assistant.slice(0, 1500),
      transcriptSnippet: tStr.slice(0, 4000),
      criteria: {
        toolInvocationInTrace,
        resultMatchesBindingHint: resultMatchesBinding,
      },
      note: "Supporting evidence only; does not close G3 alone if flaky. Not a live-gate close.",
    });
    if (agentId) {
      try {
        await client.stopAgent(agentId, "g3-p3 cleanup");
      } catch {
        /* ignore */
      }
    }
    try {
      await client.close?.();
    } catch {
      /* ignore */
    }
    process.exitCode = pass ? 0 : 1;
  }
}

main().catch((err) => {
  console.error(err);
  writeArtifact({
    probe: "G3-P3",
    status: "Fail",
    label: "offline-model",
    generatedAt: new Date().toISOString(),
    provider: PROVIDER,
    model: MODEL,
    spend: "none — Ollama local only",
    error: String(err?.stack || err),
    criteria: { toolInvocationInTrace: false },
  });
  process.exit(1);
});
