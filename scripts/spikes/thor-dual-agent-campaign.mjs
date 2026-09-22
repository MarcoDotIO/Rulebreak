#!/usr/bin/env node
/**
 * RB-011 dual-agent Thor campaign entrypoint.
 *
 * Usage (Marco's Mac with gitignored .env):
 *   RULEBREAK_LIVE_ENABLED=true npm run spike:thor-dual -- --dry-run
 *   RULEBREAK_LIVE_ENABLED=true npm run spike:thor-dual
 *
 * Never echoes THOR_SSH_PASSWORD into stdout/stderr/artifacts.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT, loadDotEnvFile, redactSecrets } from "./thor-ssh-lib.mjs";
import { runThorDualAgentCampaign } from "./thor-dual-agent-lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactPath = join(REPO_ROOT, "docs/spikes/thor-dual-agent-artifact.json");

function parseArgs(argv) {
  return { dryRun: argv.includes("--dry-run") };
}

function main() {
  loadDotEnvFile(join(REPO_ROOT, ".env"), process.env);
  const args = parseArgs(process.argv.slice(2));
  const result = runThorDualAgentCampaign({ dryRun: args.dryRun });

  const password = process.env.THOR_SSH_PASSWORD || "";
  const safeJson = redactSecrets(JSON.stringify(result, null, 2), password);

  if (result.status === "refuseLive") {
    console.error(result.detail);
    console.error(
      JSON.stringify(
        {
          status: result.status,
          code: result.code,
          labels: result.labels,
          agentCount: result.agentCount,
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, safeJson + "\n");
  console.log(safeJson);
  console.log(`artifact=${artifactPath}`);

  if (result.status === "Fail") process.exit(1);
  process.exit(0);
}

main();
