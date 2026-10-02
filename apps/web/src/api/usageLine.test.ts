import { describe, expect, it } from "vitest";
import { formatUsage, USAGE_NOT_REPORTED } from "./usageLine";

describe("RB-023 usage line", () => {
  it("server shape after #89: tokens and cost are not reported, counts are real", () => {
    expect(formatUsage({ toolCalls: 3, mutations: 1 })).toBe(
      "Usage: 3 tool calls, 1 mutation, tokens not reported, cost not reported",
    );
  });

  it("a real 0 still reads 0", () => {
    expect(formatUsage({ toolCalls: 0, mutations: 0 })).toBe(
      "Usage: 0 tool calls, 0 mutations, tokens not reported, cost not reported",
    );
    expect(formatUsage({ toolCalls: 0, mutations: 0, tokens: 0, costUsd: 0 })).toBe(
      "Usage: 0 tool calls, 0 mutations, 0 tokens, $0",
    );
  });

  it("singular forms", () => {
    expect(formatUsage({ toolCalls: 1, mutations: 1, tokens: 1, costUsd: 0.01 })).toBe(
      "Usage: 1 tool call, 1 mutation, 1 token, $0.01",
    );
  });

  it("each missing field reads 'not reported' on its own", () => {
    expect(formatUsage({ mutations: 2, tokens: 10 })).toBe(
      "Usage: tool calls not reported, 2 mutations, 10 tokens, cost not reported",
    );
    expect(formatUsage({})).toBe(
      "Usage: tool calls not reported, mutations not reported, tokens not reported, cost not reported",
    );
  });

  it("null usage (e.g. after start_error) reads 'Usage not reported', never zero", () => {
    for (const u of [null, undefined]) {
      const line = formatUsage(u);
      expect(line).toBe(USAGE_NOT_REPORTED);
      expect(line).not.toMatch(/\b0\b|\$0/);
    }
  });
});
