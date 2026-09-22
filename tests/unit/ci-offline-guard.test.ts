import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const script = resolve("scripts/ci-offline.mjs");

function run(env: Record<string, string | undefined>) {
  return spawnSync(process.execPath, [script], {
    env: { ...process.env, ...env, // force skip heavy steps by failing early on env
    },
    encoding: "utf8",
  });
}

describe("ci-offline env guards", () => {
  it("refuses live mode before running suites", () => {
    const result = run({ RULEBREAK_LIVE_ENABLED: "true" });
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/LIVE_ENABLED/);
  });

  it("refuses ambient provider secrets before running suites", () => {
    const result = run({
      RULEBREAK_LIVE_ENABLED: "false",
      XAI_API_KEY: "sk-test-not-real",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/ambient credentials/);
  });

  it("refuses ambient Thor SSH password before running suites", () => {
    const result = run({
      RULEBREAK_LIVE_ENABLED: "false",
      THOR_SSH_PASSWORD: "not-a-real-password",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/ambient credentials/);
  });
});
