#!/usr/bin/env node
/**
 * RB-012 — local offline gate (not GitHub Actions).
 * Fresh-checkout path: preflight → typecheck → full vitest → web typecheck/build.
 * Refuses live mode and ambient provider credentials.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const AMBIENT_SECRET_KEYS = [
  "XAI_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "GROQ_API_KEY",
  "TOGETHER_API_KEY",
  "MISTRAL_API_KEY",
  "COHERE_API_KEY",
  "RULEBREAK_OPERATOR_TOKEN",
];

function fail(msg) {
  console.error(`ci:offline FAILED: ${msg}`);
  process.exit(1);
}

function assertOfflineEnv() {
  if (process.env.RULEBREAK_LIVE_ENABLED === "true") {
    fail(
      "RULEBREAK_LIVE_ENABLED=true — offline gate refuses live mode. Use an explicit live smoke path after G2–G4.",
    );
  }

  const present = AMBIENT_SECRET_KEYS.filter((key) => {
    const v = process.env[key];
    return typeof v === "string" && v.trim().length > 0;
  });
  if (present.length > 0) {
    fail(
      `ambient credentials in environment: ${present.join(", ")}. Unset them for offline CI (no paid/provider calls).`,
    );
  }

  // .env must not flip live on for this gate
  const envPath = join(root, ".env");
  if (existsSync(envPath)) {
    const text = readFileSync(envPath, "utf8");
    if (/^\s*RULEBREAK_LIVE_ENABLED\s*=\s*true\s*$/m.test(text)) {
      fail(".env sets RULEBREAK_LIVE_ENABLED=true — offline gate refuses");
    }
  }

  console.log("offline_env=ok (live disabled, no ambient provider secrets)");
}

function run(label, command, args) {
  console.log(`\n==> ${label}\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: {
      ...process.env,
      RULEBREAK_LIVE_ENABLED: "false",
      CI: process.env.CI ?? "1",
    },
    stdio: "inherit",
    shell: false,
  });
  if (result.error) fail(`${label}: ${result.error.message}`);
  if (result.status !== 0) fail(`${label} exited ${result.status}`);
}

assertOfflineEnv();

run("preflight", "npm", ["run", "preflight"]);
run("typecheck (root)", "npm", ["run", "typecheck"]);
run("vitest (offline suite)", "npm", ["test"]);
run("web typecheck", "npm", ["run", "typecheck", "-w", "@rulebreak/web"]);
run("web build", "npm", ["run", "build:web"]);

console.log("\nci:offline OK — offline gate green (no live / no ambient secrets)");
