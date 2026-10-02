import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// RB-019 acceptance item 3: packages/verifier reads no target or fixture internals.
// Checked on the source text, transitively through the one workspace package it may use.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const ALLOWED: Record<string, { dir: string; external: readonly string[] }> = {
  verifier: { dir: "packages/verifier/src", external: ["@rulebreak/contracts", "node:crypto"] },
  contracts: { dir: "packages/contracts/src", external: ["zod"] },
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [path] : [];
  });
}

/** Every module specifier: static import/export, side-effect import, dynamic import(), require(). */
export function moduleSpecifiers(source: string): string[] {
  const patterns = [
    /\b(?:import|export)\b[^'"`;]*?\bfrom\s*["'`]([^"'`]+)["'`]/g,
    /\bimport\s*["'`]([^"'`]+)["'`]/g,
    /\bimport\s*\(\s*["'`]?([^"'`)]+)["'`]?\s*\)/g,
    /\brequire\s*\(\s*["'`]?([^"'`)]+)["'`]?\s*\)/g,
  ];
  return patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1]!.trim()));
}

function problems(pkg: keyof typeof ALLOWED): string[] {
  const { dir, external } = ALLOWED[pkg]!;
  const absDir = join(ROOT, dir);
  const out: string[] = [];
  for (const file of sourceFiles(absDir)) {
    for (const spec of moduleSpecifiers(readFileSync(file, "utf8"))) {
      if (spec.startsWith(".")) {
        const target = relative(absDir, resolve(dirname(file), spec));
        if (target.startsWith("..")) out.push(`${relative(ROOT, file)} reaches outside its package: ${spec}`);
      } else if (!external.includes(spec)) {
        out.push(`${relative(ROOT, file)} imports ${spec}`);
      }
    }
  }
  return out;
}

describe("RB-019 verifier import boundary", () => {
  it("packages/verifier/src imports only @rulebreak/contracts, node:crypto and its own files", () => {
    expect(problems("verifier")).toEqual([]);
  });

  it("its one workspace dependency, packages/contracts/src, imports only zod and its own files", () => {
    expect(problems("contracts")).toEqual([]);
  });

  it("the package manifests declare no other dependencies", () => {
    const verifier = JSON.parse(readFileSync(join(ROOT, "packages/verifier/package.json"), "utf8"));
    const contracts = JSON.parse(readFileSync(join(ROOT, "packages/contracts/package.json"), "utf8"));
    expect(Object.keys(verifier.dependencies ?? {})).toEqual(["@rulebreak/contracts"]);
    for (const field of ["devDependencies", "peerDependencies", "optionalDependencies"]) {
      expect(verifier[field] ?? {}).toEqual({});
    }
    expect(Object.keys(contracts.dependencies ?? {}).filter((name: string) => name.startsWith("@rulebreak/"))).toEqual([]);
  });

  it("the scanner itself catches every import form (self-check)", () => {
    const sample = [
      'import { x } from "@rulebreak/economy";',
      'export * from "../economy/src/index.js";',
      'import "@rulebreak/campaign";',
      'const m = await import("@rulebreak/replay");',
      'const f = require("node:fs");',
      "import type { T } from '@rulebreak/evidence';",
    ].join("\n");
    expect(moduleSpecifiers(sample)).toEqual(
      expect.arrayContaining(["@rulebreak/economy", "../economy/src/index.js", "@rulebreak/campaign", "@rulebreak/replay", "node:fs", "@rulebreak/evidence"]),
    );
  });
});
