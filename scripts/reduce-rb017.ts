/**
 * RB-017 bounded trace reduction (npm run reduce:rb017).
 *
 * Reads the committed RB-018 snapshot (docs/spikes/rb-018-reward-report.json and .traces.json),
 * reruns its plan in memory to load each confirmed seeded_random faulty evidence bundle, and reduces
 * each one by range deletion. Every candidate is replayed with replayBundle on the faulty reward
 * build and checked by the independent verifier. The scripted_known trace is included once as a
 * labelled control. Offline only: no LLM, network or Thor calls. Paid spend is $0.
 *
 * Flags:
 *   --out <path>          artifact JSON (default artifacts/rb-017/rb-017-reduced-traces.json);
 *                         a .summary.json is written next to it
 *   --max-replays <n>     replay cap per trace (default 100)
 *   --max-wall-ms <n>     wall-clock timeout per trace in ms (default 10000)
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { RB017_SOURCE_REPORT, RB017_SOURCE_TRACES, buildRb017Reduction } from "@rulebreak/campaign";
import { RB017_DEFAULT_BOUNDS } from "@rulebreak/replay";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const HONESTY_CAPS = [
  "Offline only. Paid spend: $0. No LLM, network or Thor calls were made; the reducer makes no model calls.",
  "Inputs: the 5 confirmed seeded_random traces on synthetic-reward-faulty from rb-018-reward-offline-v1 (untuned default seeds against one planted defect). The 4-action scripted_known trace is a labelled control, by construction, not an input.",
  "Each result is reduced, not claimed to be minimal: the search is bounded (replay cap and timeout) and only deletes ranges of actions.",
  "Lengths are reported per trace only. There are no averages, medians or rates across traces.",
  "LLM arms (llm_single, llm_dual) are not_run in RB-018, so they have no traces here.",
  "Thor-over-SSH runs are not llm_dual results.",
  "G4: Not run. M13: Partial. The pitch is not closed.",
  "Not evidence of general exploit-detection performance, and no security claim about the target or Rulebreak.",
];

function codeCommit(): { commit: string | null; dirty: boolean | null } {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  if (head.status !== 0) return { commit: null, dirty: null };
  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=no", "--", "packages", "scripts"], {
    encoding: "utf8",
  });
  return { commit: head.stdout.trim(), dirty: status.status === 0 ? status.stdout.trim().length > 0 : null };
}

function main(): number {
  if (process.env.RULEBREAK_LIVE_ENABLED === "true") {
    console.error("reduce:rb017 is offline only; refusing RULEBREAK_LIVE_ENABLED=true");
    return 1;
  }
  const bounds = {
    maxReplays: Number(argValue("--max-replays") ?? RB017_DEFAULT_BOUNDS.maxReplays),
    maxWallMs: Number(argValue("--max-wall-ms") ?? RB017_DEFAULT_BOUNDS.maxWallMs),
  };
  const out = resolve(argValue("--out") ?? "artifacts/rb-017/rb-017-reduced-traces.json");
  const reportText = readFileSync(resolve(RB017_SOURCE_REPORT), "utf8");
  const tracesText = readFileSync(resolve(RB017_SOURCE_TRACES), "utf8");
  const code = codeCommit();

  const artifact = buildRb017Reduction(reportText, tracesText, { bounds });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(artifact, null, 2)}\n`);
  const summaryPath = out.replace(/\.json$/, "") + ".summary.json";
  writeFileSync(
    summaryPath,
    `${JSON.stringify(
      {
        reductionId: artifact.reductionId,
        code,
        source: artifact.source,
        bounds: artifact.bounds,
        caveat: artifact.caveat,
        reductionScopeNote: artifact.reductionScopeNote,
        honestyCaps: HONESTY_CAPS,
        traces: artifact.traces.map((t) => ({
          runId: t.runId,
          role: t.role,
          originalCountedActions: t.originalCountedActions,
          originalReplayableActions: t.originalReplayableActions,
          reducedLength: t.reducedLength,
          replaysUsed: t.replaysUsed,
          status: t.status,
          stopReason: t.stopReason,
          line: t.line,
        })),
      },
      null,
      2,
    )}\n`,
  );

  console.log(`RB-017 bounded trace reduction, offline: ${artifact.reductionId}`);
  console.log(`code commit: ${code.commit ?? "unknown"}${code.dirty ? " (+ uncommitted changes in packages/ or scripts/)" : ""}`);
  console.log(`source: ${artifact.source.reportFile} (sha256 ${artifact.source.reportSha256})`);
  console.log(`source: ${artifact.source.tracesFile} (sha256 ${artifact.source.tracesSha256})`);
  console.log(`bounds: ${bounds.maxReplays} replays and ${bounds.maxWallMs} ms per trace\n`);
  console.log("| run | role | original counted actions | replayed actions | reduced length | replays used | stop reason |");
  console.log("| --- | --- | --- | --- | --- | --- | --- |");
  for (const t of artifact.traces)
    console.log(
      `| ${t.runId} | ${t.role} | ${t.originalCountedActions} | ${t.originalReplayableActions} | ${t.reducedLength} | ${t.replaysUsed} | ${t.stopReason} |`,
    );
  console.log("\nResults:");
  for (const t of artifact.traces) console.log(`  ${t.line}`);
  console.log(`\n${artifact.reductionScopeNote}`);
  console.log(`\nHonesty caps:\n${HONESTY_CAPS.map((c) => `  - ${c}`).join("\n")}`);
  console.log(`\nwrote ${out}\nwrote ${summaryPath}`);
  return 0;
}

process.exit(main());
