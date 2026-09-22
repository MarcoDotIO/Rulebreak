import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const campaignScript = resolve(root, "scripts/spikes/thor-dual-agent-campaign.mjs");
const libUrl = pathToFileURL(resolve(root, "scripts/spikes/thor-dual-agent-lib.mjs")).href;

function spawnCampaign(env: Record<string, string | undefined>, args: string[] = []) {
  const clean: Record<string, string> = {};
  if (process.env.PATH) clean.PATH = process.env.PATH;
  if (process.env.HOME) clean.HOME = process.env.HOME;
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) clean[k] = v;
  }
  return spawnSync(process.execPath, [campaignScript, ...args], {
    cwd: root,
    env: clean,
    encoding: "utf8",
  });
}

describe("thor-dual-agent refuse-by-default", () => {
  it("refuses when RULEBREAK_LIVE_ENABLED is unset", () => {
    const result = spawnCampaign({});
    expect(result.status).not.toBe(0);
    const out = `${result.stderr}${result.stdout}`;
    expect(out).toMatch(/REFUSE|refuseLive/i);
    expect(out).toMatch(/SSH_not_G4|paid_cloud_\$0/);
  });

  it("refuses when live is false and does not leak password", () => {
    const secret = "dual-agent-secret-must-not-leak";
    const result = spawnCampaign({
      RULEBREAK_LIVE_ENABLED: "false",
      THOR_SSH_PASSWORD: secret,
    });
    expect(result.status).not.toBe(0);
    const out = `${result.stderr}${result.stdout}`;
    expect(out).toMatch(/REFUSE|refuseLive/i);
    expect(out).not.toContain(secret);
  });
});

describe("thor-dual-agent-lib dry-run dual agents", () => {
  it("builds generate cmd without embedding secrets", async () => {
    const lib = await import(libUrl);
    const cmd = lib.buildOllamaGenerateCmd({
      model: "llama3.2",
      agentId: "thor-player-a-deadbeef",
      actorId: "player-a",
      prompt: "READY player-a",
    });
    expect(cmd).toMatch(/\/api\/generate/);
    expect(cmd).toMatch(/llama3\.2/);
    expect(cmd).not.toMatch(/THOR_SSH_PASSWORD/);
  });

  it("dry-run yields two distinct agents with honesty labels", async () => {
    const lib = await import(libUrl);
    const secret = "must-not-leak-dual-agent";
    const result = lib.runThorDualAgentCampaign({
      dryRun: true,
      env: {
        RULEBREAK_LIVE_ENABLED: "true",
        THOR_SSH_PASSWORD: secret,
        THOR_SSH_HOST: "thor.example.test",
        THOR_SSH_USER: "probe",
        THOR_OLLAMA_MODEL: "llama3.2",
      },
      execRemote: (_cfg: unknown, cmd: string) => {
        if (String(cmd).includes("/api/tags")) {
          return {
            ok: true,
            status: 0,
            stdout: JSON.stringify({ models: [{ name: "llama3.2" }] }),
            stderr: "",
            error: null,
          };
        }
        // Ensure agent-specific READY line so parseGenerateStdout ok
        const actor = String(cmd).includes("player-b") ? "player-b" : "player-a";
        return {
          ok: true,
          status: 0,
          stdout: JSON.stringify({
            model: "llama3.2",
            response: `READY ${actor}`,
            done: true,
          }),
          stderr: "",
          error: null,
        };
      },
    });

    expect(result.status).toBe("dry-run");
    expect(result.agentCount).toBe(2);
    expect(result.agents.map((a: { actorId: string }) => a.actorId)).toEqual([
      "player-a",
      "player-b",
    ]);
    const ids = result.agents.map((a: { agentId: string }) => a.agentId);
    expect(new Set(ids).size).toBe(2);
    expect(result.criteria.bothGenerateOk).toBe(true);
    expect(result.labels.containment).toBe("SSH_not_G4");
    expect(result.labels.spend).toBe("paid_cloud_$0");
    expect(result.labels.g4P3).toBe("Not run");
    expect(result.labels.g4P4).toBe("Not run");
    expect(result.labels.pitch).toBe("RB-011_not_closed_pitch");
    // Dry-run must not claim RB-011 Done
    expect(result.labels.rb011).toBe("Partial_or_In_Progress");
    expect(result.labels.dualAgentEvidence).toBe("dry_run_mock_only");
    const dumped = JSON.stringify(result);
    expect(dumped).not.toContain(secret);
  });

  it("live mock Pass marks dualAgentEvidence real and rb011 Done label (not closed pitch)", async () => {
    const lib = await import(libUrl);
    const result = lib.runThorDualAgentCampaign({
      dryRun: false,
      env: {
        RULEBREAK_LIVE_ENABLED: "true",
        THOR_SSH_PASSWORD: "x",
        THOR_SSH_HOST: "thor.example.test",
        THOR_SSH_USER: "probe",
        THOR_OLLAMA_MODEL: "llama3.2",
      },
      execRemote: (_cfg: unknown, cmd: string) => {
        if (String(cmd).includes("/api/tags")) {
          return {
            ok: true,
            status: 0,
            stdout: JSON.stringify({ models: [{ name: "llama3.2" }] }),
            stderr: "",
            error: null,
          };
        }
        const actor = String(cmd).includes("player-b") ? "player-b" : "player-a";
        return {
          ok: true,
          status: 0,
          stdout: JSON.stringify({
            model: "llama3.2",
            response: `READY ${actor}`,
            done: true,
          }),
          stderr: "",
          error: null,
        };
      },
    });
    expect(result.status).toBe("Pass");
    expect(result.labels.dualAgentEvidence).toBe("real_thor_dual_ollama_generate");
    expect(result.labels.rb011).toBe("Done");
    expect(result.labels.pitch).toBe("RB-011_not_closed_pitch");
    expect(result.labels.notClaimed).toMatch(/G4_Pass/);
  });
});
