/**
 * Honest Thor dual-agent capability surface for the control API.
 * Never returns secrets. SSH ≠ G4; not AgenC dual sessions; pitch not closed.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

export type ThorDualAgentCapabilities = {
  /** Operator may enable live provenance for Thor dual-agent evidence. */
  canEnableLiveAgents: boolean;
  /** RULEBREAK_LIVE_ENABLED === "true" (process/env after optional .env load). */
  liveGateOpen: boolean;
  /** Password present in env — boolean only, never the value. */
  thorPasswordConfigured: boolean;
  /** Host/user public labels only. */
  thorHost: string;
  thorUser: string;
  /** Distinguisher: Thor SSH Ollama player-a/player-b, not AgenC daemon dual sessions. */
  pathKind: "thor_ssh_dual_ollama";
  notAgenCDualSessions: true;
  paidCloudCapUsd: 0;
  sshIsG4Containment: false;
  g4P3: "Not run";
  g4P4: "Not run";
  pitchClosed: false;
  /** Redacted summary from docs/spikes/thor-dual-agent-artifact.json when present. */
  evidence: {
    present: boolean;
    status: string | null;
    rb011: string | null;
    dualAgentEvidence: string | null;
    actorIds: string[];
    note: string | null;
  };
  honestyNotes: string[];
};

type ArtifactShape = {
  status?: string;
  agents?: Array<{ actorId?: string }>;
  labels?: {
    rb011?: string;
    dualAgentEvidence?: string;
    pitch?: string;
  };
  note?: string;
};

/** Load KEY=VALUE from .env into env without overriding existing keys. Never logs values. */
export function loadDotEnvPresence(
  envPath = join(REPO_ROOT, ".env"),
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!existsSync(envPath)) return { loaded: false as const };
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
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
    if (env[key] === undefined) env[key] = value;
  }
  return { loaded: true as const };
}

function readDualAgentArtifact(
  artifactPath = join(REPO_ROOT, "docs/spikes/thor-dual-agent-artifact.json"),
): ArtifactShape | null {
  if (!existsSync(artifactPath)) return null;
  try {
    return JSON.parse(readFileSync(artifactPath, "utf8")) as ArtifactShape;
  } catch {
    return null;
  }
}

export function getThorDualAgentCapabilities(
  env: NodeJS.ProcessEnv = process.env,
  opts: { loadDotEnv?: boolean; artifactPath?: string } = {},
): ThorDualAgentCapabilities {
  if (opts.loadDotEnv !== false) {
    loadDotEnvPresence(join(REPO_ROOT, ".env"), env);
  }

  const liveGateOpen = env.RULEBREAK_LIVE_ENABLED === "true";
  const thorPasswordConfigured = Boolean(env.THOR_SSH_PASSWORD?.trim());
  const thorHost = (env.THOR_SSH_HOST || "thor.atr.cs.kent.edu").trim();
  const thorUser = (env.THOR_SSH_USER || "marnett5").trim();

  const artifact = readDualAgentArtifact(opts.artifactPath);
  const actorIds =
    artifact?.agents
      ?.map((a) => a.actorId)
      .filter((id): id is string => Boolean(id)) ?? [];
  const dualAgentEvidence = artifact?.labels?.dualAgentEvidence ?? null;
  const rb011 = artifact?.labels?.rb011 ?? null;
  const status = artifact?.status ?? null;
  const evidencePass =
    status === "Pass" &&
    (dualAgentEvidence === "real_thor_dual_ollama_generate" ||
      rb011 === "Done");

  const canEnableLiveAgents =
    (liveGateOpen && thorPasswordConfigured) || evidencePass;

  return {
    canEnableLiveAgents,
    liveGateOpen,
    thorPasswordConfigured,
    thorHost,
    thorUser,
    pathKind: "thor_ssh_dual_ollama",
    notAgenCDualSessions: true,
    paidCloudCapUsd: 0,
    sshIsG4Containment: false,
    g4P3: "Not run",
    g4P4: "Not run",
    pitchClosed: false,
    evidence: {
      present: Boolean(artifact),
      status,
      rb011,
      dualAgentEvidence,
      actorIds,
      note: artifact?.note ?? null,
    },
    honestyNotes: [
      "Thor SSH dual-agent (player-a / player-b Ollama) — not AgenC dual sessions",
      "SSH ≠ G4 containment; G4-P3/P4 Not run",
      "Paid cloud hard cap $0",
      "Pitch not closed — evidence Done is not a closed live discovery claim",
      "Browser does not run Thor SSH; live generate stays CLI (npm run spike:thor-dual)",
    ],
  };
}
