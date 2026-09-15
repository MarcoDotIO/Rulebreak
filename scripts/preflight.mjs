#!/usr/bin/env node
/**
 * Offline preflight for Rulebreak.
 * Checks Node/npm engines, required paths, and basic config.
 * Never makes paid provider calls.
 */
import { readFileSync, existsSync, accessSync, constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const failures = [];
const warnings = [];

function parseSemver(v) {
  const m = String(v).replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function gte(a, b) {
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  return a.patch >= b.patch;
}

function lt(a, b) {
  if (a.major !== b.major) return a.major < b.major;
  if (a.minor !== b.minor) return a.minor < b.minor;
  return a.patch < b.patch;
}

function checkEngines() {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const node = parseSemver(process.versions.node);
  const npmRaw = process.env.npm_config_user_agent?.match(/npm\/(\d+\.\d+\.\d+)/)?.[1]
    ?? (() => {
      try {
        return require("child_process").execSync("npm -v", { encoding: "utf8" }).trim();
      } catch {
        return null;
      }
    })();
  const npm = npmRaw ? parseSemver(npmRaw) : null;

  const minNode = { major: 26, minor: 5, patch: 0 };
  const maxNodeExclusive = { major: 27, minor: 0, patch: 0 };
  const minNpm = { major: 11, minor: 17, patch: 0 };

  if (!node) {
    failures.push(`Could not parse Node version: ${process.versions.node}`);
  } else if (!(gte(node, minNode) && lt(node, maxNodeExclusive))) {
    failures.push(
      `Node ${process.versions.node} outside required range >=26.5.0 <27.0.0 (see .node-version and AGENTS.md §4)`,
    );
  }

  if (!npm) {
    warnings.push("Could not determine npm version");
  } else if (!gte(npm, minNpm)) {
    failures.push(`npm ${npmRaw} below required >=11.17.0 (AgenC documented floor)`);
  }

  console.log(`node=${process.versions.node} npm=${npmRaw ?? "unknown"}`);
  console.log(`package engines: ${JSON.stringify(pkg.engines)}`);
}

function checkPaths() {
  const required = [
    "AGENTS.md",
    "package.json",
    "package-lock.json",
    ".node-version",
    ".env.example",
    "tsconfig.json",
    "scripts/preflight.mjs",
    "docs/compatibility.md",
  ];
  for (const rel of required) {
    const p = join(root, rel);
    if (!existsSync(p)) failures.push(`Missing required path: ${rel}`);
  }

  const nodeVersion = readFileSync(join(root, ".node-version"), "utf8").trim();
  if (nodeVersion !== "26.5.0") {
    warnings.push(`.node-version is "${nodeVersion}"; expected 26.5.0 for the initial pin`);
  }

  // Data dir must be creatable/writable when present; default is relative.
  const dataDir = process.env.RULEBREAK_DATA_DIR || ".rulebreak";
  const absData = resolve(root, dataDir);
  try {
    if (existsSync(absData)) {
      accessSync(absData, constants.W_OK);
    }
  } catch {
    failures.push(`RULEBREAK_DATA_DIR not writable: ${absData}`);
  }
}

function checkLiveGuard() {
  if (process.env.RULEBREAK_LIVE_ENABLED === "true") {
    const model = process.env.RULEBREAK_MODEL?.trim();
    const token = process.env.RULEBREAK_OPERATOR_TOKEN?.trim();
    if (!model || !token) {
      failures.push(
        "RULEBREAK_LIVE_ENABLED=true requires RULEBREAK_MODEL and RULEBREAK_OPERATOR_TOKEN (offline preflight refuses incomplete live config)",
      );
    }
  } else {
    console.log("live_mode=disabled (default offline)");
  }
}

function checkLintPlaceholder() {
  if (process.argv.includes("--lint-placeholder")) {
    console.log("lint: placeholder — ESLint not pinned yet; typecheck is the static gate for RB-002");
  }
}

checkEngines();
checkPaths();
checkLiveGuard();
checkLintPlaceholder();

if (warnings.length) {
  console.log("\nWarnings:");
  for (const w of warnings) console.log(`- ${w}`);
}

if (failures.length) {
  console.error("\nPreflight FAILED:");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log("\nPreflight OK (offline)");
