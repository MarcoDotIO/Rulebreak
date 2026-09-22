#!/usr/bin/env node
/**
 * RB-011 / live-ish G2–G4 — Thor SSH lib (networked local LLM, paid cloud $0).
 * Secrets from gitignored .env only. SSH ≠ G4 containment.
 * Never log or return THOR_SSH_PASSWORD.
 */
import { existsSync, readFileSync, writeFileSync, chmodSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, "../..");

export const DEFAULT_THOR_HOST = "thor.atr.cs.kent.edu";
export const DEFAULT_THOR_USER = "marnett5";
/** Default remote check: Ollama tags on Thor loopback (paid cloud $0). */
export const DEFAULT_THOR_LLM_PROBE_CMD =
  "curl -sS --max-time 30 http://127.0.0.1:11434/api/tags";

export const PAID_CLOUD_CAP_USD = 0;

const SECRET_ENV_KEYS = [
  "THOR_SSH_PASSWORD",
  "XAI_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "RULEBREAK_OPERATOR_TOKEN",
];

/**
 * Parse KEY=VALUE lines from a .env file into process.env (does not override existing).
 * Never prints values.
 */
export function loadDotEnvFile(envPath = join(REPO_ROOT, ".env"), env = process.env) {
  if (!existsSync(envPath)) {
    return { loaded: false, path: envPath, keys: [] };
  }
  const text = readFileSync(envPath, "utf8");
  const keys = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (env[key] === undefined) {
      env[key] = value;
      keys.push(key);
    }
  }
  return { loaded: true, path: envPath, keys };
}

export function redactSecrets(text, password) {
  let out = String(text ?? "");
  if (password && password.length > 0) {
    out = out.split(password).join("[REDACTED]");
  }
  for (const key of SECRET_ENV_KEYS) {
    const v = process.env[key];
    if (v && v.trim()) out = out.split(v).join("[REDACTED]");
  }
  return out;
}

/**
 * @typedef {object} ThorConfig
 * @property {string} host
 * @property {string} user
 * @property {string} password
 * @property {string} llmProbeCmd
 * @property {boolean} liveEnabled
 * @property {number} paidCloudCapUsd
 * @property {string} providerLabel
 */

/**
 * Read Thor SSH config from env (after loadDotEnvFile). Password never logged.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {ThorConfig}
 */
export function getThorConfig(env = process.env) {
  return {
    host: (env.THOR_SSH_HOST || DEFAULT_THOR_HOST).trim(),
    user: (env.THOR_SSH_USER || DEFAULT_THOR_USER).trim(),
    password: (env.THOR_SSH_PASSWORD || "").trim(),
    llmProbeCmd: (env.THOR_LLM_PROBE_CMD || DEFAULT_THOR_LLM_PROBE_CMD).trim(),
    liveEnabled: env.RULEBREAK_LIVE_ENABLED === "true",
    paidCloudCapUsd: PAID_CLOUD_CAP_USD,
    providerLabel: "thor-ssh-networked-local-llm",
  };
}

/**
 * Live gate for Thor probe. Default refuse. Paid cloud hard cap $0.
 * @returns {{ ok: true, config: ThorConfig } | { ok: false, code: string, message: string }}
 */
export function assertThorLiveGate(env = process.env, { requirePassword = true } = {}) {
  const config = getThorConfig(env);

  if (!config.liveEnabled) {
    return {
      ok: false,
      code: "refuseLive",
      message:
        "REFUSE: RULEBREAK_LIVE_ENABLED is not true — Thor live probe stays refuse-by-default (RB-011).",
    };
  }

  if (config.paidCloudCapUsd !== 0) {
    return {
      ok: false,
      code: "paidCap",
      message: "REFUSE: Thor path requires paid cloud hard cap $0.",
    };
  }

  // This probe never calls paid cloud APIs (hard cap $0). RULEBREAK_PROVIDER may
  // still say "grok" from .env.example defaults — ignored here on purpose.

  if (requirePassword && !config.password) {
    return {
      ok: false,
      code: "missingPassword",
      message:
        "REFUSE: THOR_SSH_PASSWORD missing — set it only in gitignored rulebreak/.env (never commit).",
    };
  }

  if (!config.host || !config.user) {
    return {
      ok: false,
      code: "missingHostUser",
      message: "REFUSE: THOR_SSH_HOST / THOR_SSH_USER required.",
    };
  }

  return { ok: true, config };
}

/**
 * Public summary safe for artifacts / logs (no password).
 */
export function publicThorSummary(config) {
  return {
    provider: config.providerLabel,
    host: config.host,
    user: config.user,
    paidCloudCapUsd: config.paidCloudCapUsd,
    liveEnabled: config.liveEnabled,
    llmProbeCmd: config.llmProbeCmd,
    sshIsG4Containment: false,
    g4P3: "Not run",
    g4P4: "Not run",
    passwordPresent: Boolean(config.password),
  };
}

/**
 * Execute a remote command over SSH using OpenSSH + SSH_ASKPASS (password never on argv).
 * Injectable for tests via opts.execRemote.
 *
 * @param {ThorConfig} config
 * @param {string} remoteCommand
 * @param {{ execRemote?: Function, timeoutMs?: number }} [opts]
 */
export function execThorSsh(config, remoteCommand, opts = {}) {
  if (typeof opts.execRemote === "function") {
    return opts.execRemote(config, remoteCommand);
  }

  const timeoutMs = opts.timeoutMs ?? 60_000;
  const target = `${config.user}@${config.host}`;
  const dir = mkdtempSync(join(tmpdir(), "rb-thor-askpass-"));
  const askpassPath = join(dir, "askpass.mjs");
  // Askpass reads password from env; never embeds the secret in the script body.
  writeFileSync(
    askpassPath,
    "#!/usr/bin/env node\nprocess.stdout.write(process.env.THOR_SSH_PASSWORD || \"\");\n",
    { mode: 0o700 },
  );
  chmodSync(askpassPath, 0o700);

  try {
    const result = spawnSync(
      "ssh",
      [
        "-o",
        "BatchMode=no",
        "-o",
        "PreferredAuthentications=password",
        "-o",
        "PubkeyAuthentication=no",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "NumberOfPasswordPrompts=1",
        target,
        remoteCommand,
      ],
      {
        encoding: "utf8",
        timeout: timeoutMs,
        env: {
          ...process.env,
          THOR_SSH_PASSWORD: config.password,
          SSH_ASKPASS: askpassPath,
          SSH_ASKPASS_REQUIRE: "force",
          DISPLAY: process.env.DISPLAY || ":0",
          // Avoid inheriting a forwarded agent as auth path for this probe.
          SSH_AUTH_SOCK: "",
        },
      },
    );

    const stdout = redactSecrets(result.stdout || "", config.password);
    const stderr = redactSecrets(result.stderr || "", config.password);
    return {
      ok: result.status === 0,
      status: result.status,
      stdout,
      stderr,
      error: result.error ? redactSecrets(String(result.error.message || result.error), config.password) : null,
    };
  } finally {
    try {
      unlinkSync(askpassPath);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Run Thor live-ish probe (connectivity + local LLM on Thor).
 * @param {{ dryRun?: boolean, execRemote?: Function, env?: NodeJS.ProcessEnv }} [opts]
 */
export function runThorLiveProbe(opts = {}) {
  const env = opts.env ?? process.env;
  loadDotEnvFile(join(REPO_ROOT, ".env"), env);

  const gate = assertThorLiveGate(env, { requirePassword: !opts.dryRun });
  if (!gate.ok) {
    return {
      status: "refuseLive",
      code: gate.code,
      detail: gate.message,
      labels: {
        spend: "paid_cloud_$0",
        containment: "SSH_not_G4",
        pitch: "RB-011_In_Progress_not_closed",
      },
    };
  }

  const { config } = gate;
  const summary = publicThorSummary(config);

  if (opts.dryRun) {
    const mock =
      opts.execRemote ??
      ((_cfg, cmd) => ({
        ok: true,
        status: 0,
        stdout: `dry-run mock ok for: ${cmd}`,
        stderr: "",
        error: null,
      }));
    const conn = mock(config, "echo thor-live-connectivity");
    const llm = mock(config, config.llmProbeCmd);
    return {
      status: "dry-run",
      summary,
      connectivity: conn,
      llmProbe: llm,
      note: "Dry-run only — real Thor reachability must be verified on Marco's Mac with gitignored .env.",
      labels: {
        spend: "paid_cloud_$0",
        containment: "SSH_not_G4",
        g4P3: "Not run",
        g4P4: "Not run",
        pitch: "RB-011_In_Progress_not_closed",
      },
    };
  }

  const connectivity = execThorSsh(config, "echo thor-live-connectivity && hostname && whoami", {
    execRemote: opts.execRemote,
    timeoutMs: 45_000,
  });
  if (!connectivity.ok) {
    return {
      status: "Fail",
      summary,
      connectivity,
      detail: redactSecrets(
        connectivity.error || connectivity.stderr || "SSH connectivity failed",
        config.password,
      ),
      labels: {
        spend: "paid_cloud_$0",
        containment: "SSH_not_G4",
        g4P3: "Not run",
        g4P4: "Not run",
        pitch: "RB-011_In_Progress_not_closed",
      },
    };
  }

  const llmProbe = execThorSsh(config, config.llmProbeCmd, {
    execRemote: opts.execRemote,
    timeoutMs: 90_000,
  });

  return {
    status: llmProbe.ok ? "Pass" : "Fail",
    summary,
    connectivity: {
      ok: connectivity.ok,
      stdout: connectivity.stdout?.slice(0, 500),
      stderr: connectivity.stderr?.slice(0, 500),
    },
    llmProbe: {
      ok: llmProbe.ok,
      stdout: llmProbe.stdout?.slice(0, 2000),
      stderr: llmProbe.stderr?.slice(0, 500),
    },
    labels: {
      spend: "paid_cloud_$0",
      containment: "SSH_not_G4",
      g4P3: "Not run",
      g4P4: "Not run",
      pitch: "RB-011_In_Progress_not_closed",
      liveIsh: "networked_local_LLM_via_SSH",
    },
    note: "SSH path is networked local LLM (paid $0). Not a G4 Pass; G4-P3/P4 stay Not run.",
  };
}
