import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("toolchain pins", () => {
  it("pins Node 26.5.0 in .node-version", () => {
    const v = readFileSync(join(process.cwd(), ".node-version"), "utf8").trim();
    expect(v).toBe("26.5.0");
  });
});
