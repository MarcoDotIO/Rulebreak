import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EXPLORER_ALLOWLIST_P0,
  EXPLORER_DENIED_CAPABILITIES,
  EXPLORER_P1_TOOLS,
  LIVE_DEFAULT_ENABLED,
  LIVE_GATE_DOC,
  REJECTED_AUTHORITY_FIELDS,
  THREAT_MODEL_DOC,
  isDeniedCapability,
  isExplorerToolAllowedP0,
  isRejectedAuthorityField,
} from "@rulebreak/security-policy";

const root = process.cwd();

describe("RB-004 security policy artifacts", () => {
  it("publishes threat model and live acceptance gate docs", () => {
    expect(existsSync(join(root, THREAT_MODEL_DOC))).toBe(true);
    expect(existsSync(join(root, LIVE_GATE_DOC))).toBe(true);
    expect(existsSync(join(root, "docs/decisions/ADR-001-execution-boundaries.md"))).toBe(true);
  });

  it("keeps live mode disabled by default in policy and .env.example", () => {
    expect(LIVE_DEFAULT_ENABLED).toBe(false);
    const envExample = readFileSync(join(root, ".env.example"), "utf8");
    expect(envExample).toMatch(/RULEBREAK_LIVE_ENABLED=false/);
    expect(envExample).not.toMatch(/XAI_API_KEY=.+/);
    expect(envExample).toMatch(/THOR_SSH_PASSWORD=$/m);
    expect(envExample).not.toMatch(/THOR_SSH_PASSWORD=.+/);
  });
});

describe("explorer allow/deny matrix", () => {
  it("allows only the P0 domain tools", () => {
    for (const tool of EXPLORER_ALLOWLIST_P0) {
      expect(isExplorerToolAllowedP0(tool)).toBe(true);
    }
    expect(EXPLORER_ALLOWLIST_P0).toHaveLength(5);
    expect(isExplorerToolAllowedP0("reward_claim")).toBe(false);
    expect(EXPLORER_P1_TOOLS).toContain("reward_claim");
  });

  it("denies shell, FS, daemon, operator, reset, fixture, and related capabilities", () => {
    const required: string[] = [
      "shell_exec",
      "arbitrary_filesystem",
      "daemon_control",
      "operator_http",
      "target_reset",
      "fixture_select",
      "verifier_snapshot",
      "evidence_store_mount",
    ];
    for (const cap of required) {
      expect(isDeniedCapability(cap)).toBe(true);
    }
    expect(EXPLORER_DENIED_CAPABILITIES.length).toBeGreaterThanOrEqual(required.length);
  });

  it("rejects model-supplied authority fields", () => {
    for (const field of [
      "actorId",
      "campaignId",
      "capabilityToken",
      "targetUrl",
      "filePath",
      "fixtureMode",
    ]) {
      expect(isRejectedAuthorityField(field)).toBe(true);
    }
    expect(REJECTED_AUTHORITY_FIELDS).toContain("actorId");
  });
});

describe("runtime containment (not yet evidenced)", () => {
  it.todo("denies effective shell_exec for a bound explorer session (RB-003)");
  it.todo("denies effective arbitrary filesystem access for a bound explorer session (RB-003)");
  it.todo("rejects spoofed actorId on economy tools at the bridge (RB-003/RB-005)");
  it.todo("revokes action admission after campaign stop (RB-008)");
  it.todo("keeps fixture mode inaccessible on public explorer interfaces (RB-006)");
});
