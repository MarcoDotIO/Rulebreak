import { describe, expect, it } from "vitest";
import { BenchmarkArmSchema, BenchmarkToolNameSchema, ExplorerToolNameSchema } from "@rulebreak/contracts";
import {
  EXPLORER_ALLOWLIST_P0,
  LIVE_DEFAULT_ENABLED,
  REWARD_CLAIM_OFFLINE_ARMS,
  isExplorerToolAllowed,
  isExplorerToolAllowedP0,
  type ExplorerArm,
  type ExplorerExecution,
  type ExplorerTargetFamily,
} from "@rulebreak/security-policy";

const executions: ExplorerExecution[] = ["offline_fixture", "live"];
const families: ExplorerTargetFamily[] = ["trade", "reward"];
const arms = BenchmarkArmSchema.options as readonly ExplorerArm[];

describe("RB-018 reward_claim tool boundary", () => {
  it("policy arms match the benchmark arm enum", () => {
    expect([...arms].sort()).toEqual(["llm_dual", "llm_single", "scripted_known", "seeded_random"]);
  });

  it("allows reward_claim only offline, on the reward fixture, for non-LLM arms", () => {
    const allowed: string[] = [];
    for (const execution of executions)
      for (const targetFamily of families)
        for (const arm of arms)
          if (isExplorerToolAllowed("reward_claim", { execution, targetFamily, arm }))
            allowed.push(`${execution}/${targetFamily}/${arm}`);
    expect(allowed.sort()).toEqual(["offline_fixture/reward/scripted_known", "offline_fixture/reward/seeded_random"]);
    expect([...REWARD_CLAIM_OFFLINE_ARMS].sort()).toEqual(["scripted_known", "seeded_random"]);
  });

  it("leaves the P0 tools unchanged in every context", () => {
    for (const tool of EXPLORER_ALLOWLIST_P0)
      for (const execution of executions)
        for (const targetFamily of families)
          for (const arm of arms) expect(isExplorerToolAllowed(tool, { execution, targetFamily, arm })).toBe(true);
    expect(isExplorerToolAllowedP0("reward_claim")).toBe(false);
  });

  it("covers every benchmark tool in all 16 contexts (2 executions x 2 families x 4 arms)", () => {
    const tools = BenchmarkToolNameSchema.options;
    expect([...tools].sort()).toEqual([...EXPLORER_ALLOWLIST_P0, "reward_claim"].sort());
    let contexts = 0;
    for (const execution of executions)
      for (const targetFamily of families)
        for (const arm of arms) {
          contexts += 1;
          for (const tool of tools) {
            const expected =
              (EXPLORER_ALLOWLIST_P0 as readonly string[]).includes(tool) ||
              (tool === "reward_claim" &&
                execution === "offline_fixture" &&
                targetFamily === "reward" &&
                (arm === "scripted_known" || arm === "seeded_random"));
            expect(isExplorerToolAllowed(tool, { execution, targetFamily, arm }), `${tool} ${execution}/${targetFamily}/${arm}`).toBe(expected);
          }
        }
    expect(contexts).toBe(16);
  });

  it("a null or undefined context refuses reward_claim instead of throwing; P0 tools are unaffected", () => {
    for (const ctx of [null, undefined]) {
      expect(isExplorerToolAllowed("reward_claim", ctx)).toBe(false);
      for (const tool of EXPLORER_ALLOWLIST_P0) expect(isExplorerToolAllowed(tool, ctx)).toBe(true);
    }
  });

  it("refuses unknown tools and denied capabilities in the only permissive context", () => {
    const ctx = { execution: "offline_fixture", targetFamily: "reward", arm: "seeded_random" } as const;
    for (const tool of ["shell_exec", "target_reset", "fixture_select", "reward_grant", "REWARD_CLAIM", ""])
      expect(isExplorerToolAllowed(tool, ctx)).toBe(false);
  });

  it("keeps reward_claim off the explorer/MCP tool enum; only the benchmark list carries it", () => {
    expect(ExplorerToolNameSchema.options).not.toContain("reward_claim");
    expect(BenchmarkToolNameSchema.options).toContain("reward_claim");
    expect(LIVE_DEFAULT_ENABLED).toBe(false);
  });
});
