/**
 * RB-011 dual-agent Thor campaign runner.
 * Two Ollama /api/generate turns (player-a + player-b) over SSH.
 * SSH ≠ G4; paid cloud $0; refuse-by-default; never claim closed pitch.
 */
import { randomBytes } from "node:crypto";
import {
  assertThorLiveGate,
  execThorSsh,
  getThorConfig,
  loadDotEnvFile,
  publicThorSummary,
  redactSecrets,
  REPO_ROOT,
  PAID_CLOUD_CAP_USD,
} from "./thor-ssh-lib.mjs";
import { join } from "node:path";

const ACTORS = ["player-a", "player-b"];

export function buildOllamaGenerateCmd({ model, agentId, actorId, prompt }) {
  // Password must never appear in the remote command string.
  const payload = JSON.stringify({
    model,
    prompt: String(prompt),
    stream: false,
    options: { temperature: 0 },
  });
  const b64 = Buffer.from(payload, "utf8").toString("base64");
  return [
    `echo "model=${model};agentId=${agentId};actorId=${actorId}" >/dev/null`,
    `printf '%s' '${b64}' | base64 -d | curl -sS --max-time 120 http://127.0.0.1:11434/api/generate -H 'Content-Type: application/json' -d @-`,
  ].join(" && ");
}

function parseGenerateStdout(stdout, actorId) {
  const text = String(stdout || "").trim();
  if (!text) return { ok: false, response: "", error: "empty generate stdout" };
  try {
    const parsed = JSON.parse(text);
    const response = String(parsed.response || "");
    const ok =
      Boolean(parsed.done) &&
      response.length > 0 &&
      (response.includes(actorId) || /READY/i.test(response) || response.length > 0);
    return { ok: response.length > 0, response, error: ok ? null : "weak generate response" };
  } catch (err) {
    // Some Ollama builds stream NDJSON — take last JSON object.
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(lines[i]);
        const response = String(parsed.response || "");
        if (response) return { ok: true, response, error: null };
      } catch {
        /* continue */
      }
    }
    return { ok: false, response: text.slice(0, 200), error: `generate JSON parse: ${err.message}` };
  }
}

function honestyLabels({ dryRun, bothOk }) {
  const real = !dryRun && bothOk;
  let dualAgentEvidence = "dry_run_mock_only";
  if (real) dualAgentEvidence = "real_thor_dual_ollama_generate";
  else if (!dryRun) dualAgentEvidence = "thor_attempt_failed";
  return {
    containment: "SSH_not_G4",
    spend: "paid_cloud_$0",
    g4P3: "Not run",
    g4P4: "Not run",
    pitch: "RB-011_not_closed_pitch",
    rb011: real ? "Done" : "Partial_or_In_Progress",
    dualAgentEvidence,
    notClaimed: "closed_pitch_G4_Pass_jail_Pass",
  };
}

/**
 * @param {{ dryRun?: boolean, env?: NodeJS.ProcessEnv, execRemote?: Function }} [opts]
 */
export function runThorDualAgentCampaign(opts = {}) {
  const env = opts.env ?? process.env;
  loadDotEnvFile(join(REPO_ROOT, ".env"), env);

  const dryRun = Boolean(opts.dryRun);
  const gate = assertThorLiveGate(env, { requirePassword: !dryRun });
  if (!gate.ok) {
    return {
      status: "refuseLive",
      code: gate.code,
      detail: gate.message,
      agentCount: 0,
      agents: [],
      labels: {
        containment: "SSH_not_G4",
        spend: "paid_cloud_$0",
        g4P3: "Not run",
        g4P4: "Not run",
        pitch: "RB-011_not_closed_pitch",
        rb011: "Partial_or_In_Progress",
        dualAgentEvidence: "none",
        notClaimed: "closed_pitch_G4_Pass_jail_Pass",
      },
    };
  }

  const config = gate.config;
  const model = (env.THOR_OLLAMA_MODEL || env.THOR_LLM_MODEL || "llama3:8b").trim();
  const tagsCmd =
    (env.THOR_LLM_PROBE_CMD || "curl -sS --max-time 30 http://127.0.0.1:11434/api/tags").trim();

  const execRemote =
    typeof opts.execRemote === "function"
      ? opts.execRemote
      : dryRun
        ? (cfg, cmd) => {
            if (String(cmd).includes("/api/tags")) {
              return {
                ok: true,
                status: 0,
                stdout: JSON.stringify({ models: [{ name: model }] }),
                stderr: "",
                error: null,
              };
            }
            const actor = String(cmd).includes("player-b") ? "player-b" : "player-a";
            return {
              ok: true,
              status: 0,
              stdout: JSON.stringify({ model, response: `READY ${actor}`, done: true }),
              stderr: "",
              error: null,
            };
          }
        : (cfg, cmd) => execThorSsh(cfg, cmd, { timeoutMs: 180_000 });

  const tags = execRemote(config, tagsCmd);
  const agents = [];

  for (const actorId of ACTORS) {
    const agentId = `thor-${actorId}-${randomBytes(4).toString("hex")}`;
    const prompt = `You are ${actorId} (${agentId}). Reply with exactly: READY ${actorId}`;
    const cmd = buildOllamaGenerateCmd({ model, agentId, actorId, prompt });
    const remote = execRemote(config, cmd);
    const parsed = parseGenerateStdout(remote.stdout, actorId);
    const ok = Boolean(remote.ok && parsed.ok);
    agents.push({
      actorId,
      agentId,
      model,
      ok,
      generateOk: ok,
      sshOk: Boolean(remote.ok),
      responsePreview: redactSecrets(String(parsed.response || "").slice(0, 240), config.password),
      error: ok
        ? null
        : redactSecrets(String(parsed.error || remote.error || remote.stderr || "generate failed"), config.password),
    });
  }

  const distinctIds = new Set(agents.map((a) => a.agentId)).size === agents.length;
  const bothGenerateOk = agents.length === 2 && agents.every((a) => a.generateOk);
  const bothOk = bothGenerateOk && distinctIds && Boolean(tags.ok);
  const labels = honestyLabels({ dryRun, bothOk });

  let status;
  if (dryRun) status = "dry-run";
  else if (bothOk) status = "Pass";
  else status = "Fail";

  return {
    probe: "RB-011-dual-agent-thor",
    status,
    agentCount: agents.length,
    agents,
    model,
    tagsProbe: {
      ok: Boolean(tags.ok),
      stdout: redactSecrets(String(tags.stdout || "").slice(0, 2000), config.password),
      stderr: redactSecrets(String(tags.stderr || "").slice(0, 500), config.password),
    },
    summary: {
      ...publicThorSummary(config),
      paidCloudCapUsd: PAID_CLOUD_CAP_USD,
      sshIsG4Containment: false,
    },
    criteria: {
      twoAgents: agents.length === 2,
      distinctAgentIds: distinctIds,
      bothGenerateOk,
      paidCloudCapUsd: PAID_CLOUD_CAP_USD,
      sshIsG4Containment: false,
    },
    labels,
    note: dryRun
      ? "Dry-run mock only — real dual-agent Thor evidence must be verified on Marco's Mac with gitignored .env."
      : bothOk
        ? "Real dual-agent Thor Ollama generate evidence. SSH ≠ G4; paid cloud $0; pitch not closed."
        : "Dual-agent Thor campaign failed — see agents[].error.",
    generatedAt: new Date().toISOString(),
  };
}
