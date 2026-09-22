import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const probeScript = resolve(root, "scripts/spikes/thor-live-probe.mjs");
const libUrl = pathToFileURL(resolve(root, "scripts/spikes/thor-ssh-lib.mjs")).href;

function spawnProbe(env: Record<string, string | undefined>, args: string[] = []) {
  const clean: Record<string, string> = {};
  if (process.env.PATH) clean.PATH = process.env.PATH;
  if (process.env.HOME) clean.HOME = process.env.HOME;
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) clean[k] = v;
  }
  return spawnSync(process.execPath, [probeScript, ...args], {
    cwd: root,
    env: clean,
    encoding: "utf8",
  });
}

describe("thor-live-probe refuse-by-default", () => {
  it("refuses when RULEBREAK_LIVE_ENABLED is unset", () => {
    const result = spawnProbe({});
    expect(result.status).not.toBe(0);
    const out = `${result.stderr}${result.stdout}`;
    expect(out).toMatch(/REFUSE|refuseLive/i);
  });

  it("refuses when live is false even if password is present in env", () => {
    const secret = "super-secret-thor-password-test-only";
    const result = spawnProbe({
      RULEBREAK_LIVE_ENABLED: "false",
      THOR_SSH_PASSWORD: secret,
    });
    expect(result.status).not.toBe(0);
    const out = `${result.stderr}${result.stdout}`;
    expect(out).toMatch(/REFUSE|refuseLive/i);
    expect(out).not.toContain(secret);
  });
});

describe("thor-ssh-lib gate + dry-run", () => {
  it("assertThorLiveGate refuses by default and accepts live+password", async () => {
    const lib = await import(libUrl);
    const refused = lib.assertThorLiveGate({ RULEBREAK_LIVE_ENABLED: "false" });
    expect(refused.ok).toBe(false);
    expect(refused.code).toBe("refuseLive");

    const missing = lib.assertThorLiveGate({ RULEBREAK_LIVE_ENABLED: "true" });
    expect(missing.ok).toBe(false);
    expect(missing.code).toBe("missingPassword");

    const ok = lib.assertThorLiveGate({
      RULEBREAK_LIVE_ENABLED: "true",
      THOR_SSH_PASSWORD: "x",
      THOR_SSH_HOST: "thor.example.test",
      THOR_SSH_USER: "probe",
    });
    expect(ok.ok).toBe(true);
    expect(ok.config.paidCloudCapUsd).toBe(0);
    expect(ok.config.providerLabel).toMatch(/thor-ssh/);
  });

  it("publicThorSummary never includes password", async () => {
    const lib = await import(libUrl);
    const config = lib.getThorConfig({
      RULEBREAK_LIVE_ENABLED: "true",
      THOR_SSH_PASSWORD: "must-not-appear",
      THOR_SSH_HOST: "thor.example.test",
      THOR_SSH_USER: "probe",
    });
    const summary = lib.publicThorSummary(config);
    const dumped = JSON.stringify(summary);
    expect(dumped).not.toContain("must-not-appear");
    expect(summary.passwordPresent).toBe(true);
    expect(summary.sshIsG4Containment).toBe(false);
    expect(summary.g4P3).toBe("Not run");
    expect(summary.g4P4).toBe("Not run");
  });

  it("runThorLiveProbe dry-run uses mock SSH and redacts password", async () => {
    const lib = await import(libUrl);
    const secret = "must-not-leak-into-artifact";
    const result = lib.runThorLiveProbe({
      dryRun: true,
      env: {
        RULEBREAK_LIVE_ENABLED: "true",
        THOR_SSH_PASSWORD: secret,
        THOR_SSH_HOST: "thor.example.test",
        THOR_SSH_USER: "probe",
        THOR_LLM_PROBE_CMD: "echo llm-ok",
      },
      execRemote: (_cfg: unknown, cmd: string) => ({
        ok: true,
        status: 0,
        stdout: `mock:${cmd}`,
        stderr: "",
        error: null,
      }),
    });
    expect(result.status).toBe("dry-run");
    expect(result.labels.containment).toBe("SSH_not_G4");
    expect(result.labels.spend).toBe("paid_cloud_$0");
    const dumped = JSON.stringify(result);
    expect(dumped).not.toContain(secret);
    expect(result.summary.sshIsG4Containment).toBe(false);
  });

  it("redactSecrets strips password substrings", async () => {
    const lib = await import(libUrl);
    expect(lib.redactSecrets("pw=abc123 end", "abc123")).toBe("pw=[REDACTED] end");
  });
});
