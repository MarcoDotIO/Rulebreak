#!/usr/bin/env node
/**
 * RB-011 Thor SSH live-ish probe entrypoint.
 *
 * Default: refuse (RULEBREAK_LIVE_ENABLED must be true).
 * Paid cloud hard cap: $0 (networked local LLM on Thor via SSH).
 * SSH ≠ G4 containment — G4-P3/P4 stay Not run.
 *
 * Usage (on Marco's Mac with gitignored .env):
 *   RULEBREAK_LIVE_ENABLED=true npm run spike:thor-live
 *   RULEBREAK_LIVE_ENABLED=true npm run spike:thor-live -- --dry-run
 *
 * Never echoes THOR_SSH_PASSWORD into stdout/stderr/artifacts.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REPO_ROOT,
  loadDotEnvFile,
  runThorLiveProbe,
  redactSecrets,
} from "./thor-ssh-lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactPath = join(REPO_ROOT, "docs/spikes/thor-live-artifact.json");

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
  };
}

function main() {
  loadDotEnvFile(join(REPO_ROOT, ".env"), process.env);
  const args = parseArgs(process.argv.slice(2));
  const result = runThorLiveProbe({ dryRun: args.dryRun });

  // Belt-and-suspenders: redact anything that might have leaked into nested fields.
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
