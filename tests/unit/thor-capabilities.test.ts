import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getThorDualAgentCapabilities } from "../../apps/server/src/thor-capabilities.js";

describe("thor dual-agent UI capabilities", () => {
  it("refuses enablement without live gate or Pass evidence", () => {
    const caps = getThorDualAgentCapabilities(
      { RULEBREAK_LIVE_ENABLED: "false" },
      {
        loadDotEnv: false,
        artifactPath: join(tmpdir(), "rb-no-artifact-missing.json"),
      },
    );
    expect(caps.canEnableLiveAgents).toBe(false);
    expect(caps.sshIsG4Containment).toBe(false);
    expect(caps.pitchClosed).toBe(false);
    expect(caps.notAgenCDualSessions).toBe(true);
    expect(caps.paidCloudCapUsd).toBe(0);
    expect(caps.pathKind).toBe("thor_ssh_dual_ollama");
  });

  it("allows enablement when live gate + password present (boolean only)", () => {
    const caps = getThorDualAgentCapabilities(
      {
        RULEBREAK_LIVE_ENABLED: "true",
        THOR_SSH_PASSWORD: "must-not-appear-in-caps",
        THOR_SSH_HOST: "thor.example.test",
        THOR_SSH_USER: "tester",
      },
      {
        loadDotEnv: false,
        artifactPath: join(tmpdir(), "rb-no-artifact-missing.json"),
      },
    );
    expect(caps.canEnableLiveAgents).toBe(true);
    expect(caps.liveGateOpen).toBe(true);
    expect(caps.thorPasswordConfigured).toBe(true);
    expect(JSON.stringify(caps)).not.toContain("must-not-appear-in-caps");
  });

  it("allows enablement from #48 Pass dual-agent artifact without live gate", () => {
    const dir = mkdtempSync(join(tmpdir(), "rb-thor-caps-"));
    const artifactPath = join(dir, "thor-dual-agent-artifact.json");
    writeFileSync(
      artifactPath,
      JSON.stringify({
        status: "Pass",
        agents: [{ actorId: "player-a" }, { actorId: "player-b" }],
        labels: {
          rb011: "Done",
          dualAgentEvidence: "real_thor_dual_ollama_generate",
          pitch: "RB-011_not_closed_pitch",
        },
        note: "Real dual-agent Thor evidence",
      }),
    );
    const caps = getThorDualAgentCapabilities(
      { RULEBREAK_LIVE_ENABLED: "false" },
      { loadDotEnv: false, artifactPath },
    );
    expect(caps.canEnableLiveAgents).toBe(true);
    expect(caps.evidence.actorIds).toEqual(["player-a", "player-b"]);
    expect(caps.g4P3).toBe("Not run");
    expect(caps.g4P4).toBe("Not run");
  });
});
