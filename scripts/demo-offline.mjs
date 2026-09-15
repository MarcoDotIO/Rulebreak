#!/usr/bin/env node
/**
 * Offline demo packaging entry (RB-012).
 * Runs the offline gate, then prints the verified vertical-slice commands.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

console.log("demo:offline — running local offline gate (ci:offline)…\n");
const gate = spawnSync("node", ["./scripts/ci-offline.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, RULEBREAK_LIVE_ENABLED: "false" },
});
if (gate.status !== 0) process.exit(gate.status ?? 1);

console.log(`
demo:offline packaging OK.

Vertical slice (also covered inside ci:offline via full vitest):
  npm test -- tests/integration/scripted-campaign.test.ts
  npm test -- tests/integration/replay-regression.test.ts

UI (optional, local only):
  npm run dev:server   # control API :4100
  npm run dev:web      # UI :5173 proxies /api

Live agents: not part of this packaging. Keep RULEBREAK_LIVE_ENABLED=false.
`);
