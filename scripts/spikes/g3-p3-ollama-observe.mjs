#!/usr/bin/env node
/**
 * G3-P3: offline-model turn (Ollama only).
 * Two-turn protocol:
 *   1) system.searchTools select: load deferred economy_observe
 *   2) call economy_observe; require bound player-a JSON
 * Supporting evidence only. alwaysLoad note is deferred-MCP workaround, not G4.
 */
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "@tetsuo-ai/agenc-sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const MODEL = process.env.RULEBREAK_OLLAMA_MODEL || "gemma4";
const PROVIDER = "ollama";
const ACTOR = "player-a";
const TOOL_FQN = "mcp__rulebreak-player-a__economy_observe";
const TOOL_DOT = "mcp.rulebreak-player-a.economy_observe";
const home = join(root, `.rulebreak/agenc-home-${ACTOR}`);
const agencBin = join(root, "node_modules", ".bin", "agenc");
const TURN_MS = Number(process.env.RULEBREAK_G3P3_TIMEOUT_MS || 240_000);
const outPath = join(root, "docs/spikes/g3-p3-ollama-artifact.json");
const EAGER_NOTE =
  "economy_observe may use MCP _meta['anthropic/alwaysLoad'] as deferred-MCP workaround (eager-load). Not a G4 containment claim.";

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
  const name = String(req.toolName || req.name || "");
  if (/bash|shell|exec|write|edit|remove|delete|EnterPlanMode|ExitPlanMode|Glob|Grep|Read|Bash|Orient|exec_command/i.test(name)) {
    return false;
  }
  return (
    /^(system\.searchTools|ToolSearch)$/i.test(name) ||
    /economy_observe/i.test(name) ||
    /^mcp__rulebreak-player-a__/i.test(name) ||
    /^mcp\.rulebreak-player-a\./i.test(name)
  );
}

function writeArtifact(artifact) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n");
  console.log(JSON.stringify({ status: artifact.status, outPath, criteria: artifact.criteria }, null, 2));
}

function grade(blob, toolEvents) {
  const toolInvocationInTrace =
    toolEvents.some((e) => /economy_observe/i.test(String(e.toolName || ""))) ||
    /economy_observe/i.test(blob);
  // Scope toolError to economy_observe only — denied FileRead/Glob/etc must not dirty Pass.
  const observeEvents = toolEvents.filter((e) =>
    /economy_observe/i.test(String(e.toolName || e.name || e.tool || "")),
  );
  const toolError = observeEvents.some(
    (e) =>
      e.is_error === true ||
      e.isError === true ||
      e.error ||
      /No such tool available|Permission denied|tool_use_error|"is_error"\s*:\s*true/i.test(
        String(e.result || e.output || e.content || ""),
      ),
  );
  const hasBoundPayload =
    /"actorId"\s*:\s*"player-a"/i.test(blob) &&
    (/"currency"\s*:\s*\d+/i.test(blob) || /"inventory"\s*:\s*\[/i.test(blob));
  // Success if bound JSON present even if an earlier attempt errored before searchTools load.
  const successfulObserve = toolInvocationInTrace && hasBoundPayload;
  const resultMatchesBinding = successfulObserve && !/"actorId"\s*:\s*"player-b"/i.test(blob);
  const pass = successfulObserve && resultMatchesBinding;
  const status = pass ? "Pass" : toolInvocationInTrace ? "Partial" : "Fail";
  return {
    status,
    pass,
    criteria: {
      toolInvocationInTrace,
      toolError,
      hasBoundPayload,
      successfulObserve,
      resultMatchesBinding,
    },
  };
}

function findRollout(homeDir, agentId) {
  const projects = join(homeDir, "projects");
  if (!existsSync(projects) || !agentId) return null;
  const found = [];
  const walk = (d) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.startsWith("rollout-") && ent.name.endsWith(".jsonl") && p.includes(agentId)) {
        found.push(p);
      }
    }
  };
  walk(projects);
  found.sort();
  return found.at(-1) || null;
}

async function runPrompt(session, prompt, toolEvents, label, timeoutMs, { cancelOnTimeout = true } = {}) {
  console.log(JSON.stringify({ phase: "prompt", label }));
  const run = session.prompt(prompt, { includeUsage: false });
  let assistant = "";
  const startCount = toolEvents.length;
  const timer = setTimeout(() => {
    const newEvents = toolEvents.slice(startCount);
    const gotSearch = newEvents.some((e) => /searchTools/i.test(String(e.toolName || "")));
    const gotObserve = newEvents.some((e) => /economy_observe/i.test(String(e.toolName || "")));
    console.log(JSON.stringify({ phase: "timeout", label, ms: timeoutMs, gotSearch, gotObserve, cancelOnTimeout }));
    // Avoid poisoning the session after a successful searchTools load.
    if (cancelOnTimeout && !(label === "load" && gotSearch)) {
      session.cancelTurn(`g3-p3 ${label} timeout`).catch(() => {});
    }
  }, timeoutMs);
  try {
    for await (const ev of run) {
      if (ev.type === "tool_call" || ev.type === "permission_request") {
        const toolName = ev.toolName || ev.name;
        toolEvents.push({
          type: ev.type,
          toolName,
          requestId: ev.requestId || ev.id,
          permissions: ev.permissions,
          input: ev.input,
          label,
        });
        console.log(ev.type, toolName || "", label);
      } else if (ev.type === "text" && ev.delta) {
        assistant += ev.delta;
      } else if (ev.type === "message_committed") {
        assistant = ev.text || assistant;
      } else if (ev.type === "error") {
        toolEvents.push({ type: "error", detail: ev, label });
        console.error("prompt event error:", ev);
      }
    }
  } catch (err) {
    console.error(`prompt ended (${label}):`, err?.message || err);
  } finally {
    clearTimeout(timer);
  }
  return assistant;
}

async function main() {
  refuseLive();
  if (!existsSync(home)) {
    console.error(`missing AGENC_HOME ${home}`);
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

  console.log(JSON.stringify({ phase: "connect", home, model: MODEL, tool: TOOL_FQN }));

  const client = await connect({
    env,
    autostart: true,
    agencCommand: agencBin,
    clientName: "rulebreak-g3-p3",
    readyTimeoutMs: 90_000,
    onPermissionRequest: async (req) => {
      const allow = allowEconomyPermission(req);
      console.log("permission", JSON.stringify({ toolName: req.toolName, allow }));
      callbackLog.push({
        at: new Date().toISOString(),
        toolName: req.toolName,
        permissions: req.permissions,
        decision: allow ? "allow" : "deny",
      });
      return allow
        ? { behavior: "allow", scope: "session" }
        : { behavior: "deny", reason: "G3-P3 deny non-economy tool" };
    },
  });

  let agentId;
  let session;
  let assistant = "";
  let transcript = null;

  try {
    const agent = await client.spawnAgent({
      objective: "Load deferred MCP economy_observe, then call it once and return JSON only.",
      cwd: root,
      provider: PROVIDER,
      model: MODEL,
      // Offline spike harness only — not a product/G4 claim.
      // bypassPermissions avoids MCP approve/deny race; unattended lists keep plan/shell out.
      permissionMode: "bypassPermissions",
      unattendedAllow: [
        "system.searchTools",
        "mcp.rulebreak-player-a.economy_observe",
        "mcp__rulebreak-player-a__economy_observe",
      ],
      unattendedDeny: [
        "EnterPlanMode",
        "Bash",
        "Shell",
        "Glob",
        "Grep",
        "Read",
        "FileRead",
        "Orient",
        "AskUserQuestion",
        "exec_command",
      ],
      initialContent: [],
    });
    agentId = agent.agentId;
    console.log(JSON.stringify({ phase: "spawned", agentId }));

    const attached = await client.attachAgent(agentId);
    session = attached.session ?? (await client.createSession({ agentId, cwd: root }));
    console.log(JSON.stringify({ phase: "session", sessionId: session.sessionId }));

    const loadMs = Math.min(90_000, Math.floor(TURN_MS / 2));
    const observeMs = Math.min(120_000, Math.floor(TURN_MS / 2));

    // Turn 1: load only
    assistant += await runPrompt(
      session,
      [
        "Agent mode only. Do NOT call EnterPlanMode, Bash, Glob, Grep, Read, or shell.",
        `Call system.searchTools exactly once with {"query":"select:${TOOL_FQN}"}.`,
        "Then stop. Do not call any other tool. Reply with only the searchTools result text.",
      ].join(" "),
      toolEvents,
      "load",
      loadMs,
      { cancelOnTimeout: false },
    );

    // Turn 2: observe using the runtime-loaded DOT name first (searchTools loads that form).
    assistant += "\n" + await runPrompt(
      session,
      [
        "Agent mode only. Do NOT call EnterPlanMode, Bash, Glob, Grep, Read, shell, or searchTools.",
        `Call ${TOOL_DOT} with arguments {} now. If that fails, call ${TOOL_FQN} with arguments {}.`,
        "After the tool returns JSON containing actorId, reply with ONLY that JSON. No plans.",
      ].join(" "),
      toolEvents,
      "observe",
      observeMs,
      { cancelOnTimeout: true },
    );

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
    console.log(JSON.stringify({ phase: "finally-enter", tools: toolEvents.length, agentId }));
    try {
      let rolloutBlob = "";
      const rolloutPath = findRollout(home, agentId);
      if (rolloutPath) {
        rolloutBlob = readFileSync(rolloutPath, "utf8");
        console.log(JSON.stringify({ phase: "rollout", path: rolloutPath, bytes: rolloutBlob.length }));
      }
      const blob = assistant + JSON.stringify(transcript ?? {}) + JSON.stringify(toolEvents) + rolloutBlob;
      const { status, pass, criteria } = grade(blob, toolEvents);
      writeArtifact({
        probe: "G3-P3",
        status,
        label: "offline-model",
        generatedAt: new Date().toISOString(),
        provider: PROVIDER,
        model: MODEL,
        spend: "none — Ollama local only",
        actorId: ACTOR,
        toolFqn: TOOL_FQN,
        toolFqnAlt: TOOL_DOT,
        protocol: "two-turn: searchTools select: then economy_observe",
        eagerLoadNote: EAGER_NOTE,
        permissionModeNote: "spike uses permissionMode=bypassPermissions to avoid approve/deny race; not a G4 claim.",
        home,
        sessionId: session?.sessionId,
        agentId,
        callbackLog,
        toolEvents,
        assistantSnippet: assistant.slice(0, 1500),
        transcriptSnippet: JSON.stringify(transcript ?? {}).slice(0, 6000),
        criteria,
        note:
          status === "Pass"
            ? "Supporting evidence only; does not close G3 alone if flaky. Not a live-gate close. alwaysLoad = eager-load workaround, not G4."
            : "Honest non-Pass: need bound economy_observe JSON with actorId player-a after searchTools select. Not a live-gate close.",
      });
      if (agentId) {
        try { await client.stopAgent(agentId, "g3-p3 cleanup"); } catch { /* ignore */ }
      }
      try { await client.close?.(); } catch { /* ignore */ }
      process.exitCode = pass ? 0 : 1;
    } catch (finalizeErr) {
      console.error("finalize error:", finalizeErr);
      writeArtifact({
        probe: "G3-P3",
        status: "Fail",
        label: "offline-model",
        generatedAt: new Date().toISOString(),
        provider: PROVIDER,
        model: MODEL,
        spend: "none — Ollama local only",
        eagerLoadNote: EAGER_NOTE,
        permissionModeNote: "spike uses permissionMode=bypassPermissions to avoid approve/deny race; not a G4 claim.",
        error: String(finalizeErr?.stack || finalizeErr),
        toolEvents,
        callbackLog,
        criteria: { toolInvocationInTrace: false, hasBoundPayload: false },
      });
      process.exitCode = 1;
    }
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
    eagerLoadNote: EAGER_NOTE,
        permissionModeNote: "spike uses permissionMode=bypassPermissions to avoid approve/deny race; not a G4 claim.",
    error: String(err?.stack || err),
    criteria: { toolInvocationInTrace: false, hasBoundPayload: false },
  });
  process.exit(1);
});
