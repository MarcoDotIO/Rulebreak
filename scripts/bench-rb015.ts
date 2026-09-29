/**
 * RB-015 offline seeded baseline, contract v2 (npm run bench:rb015).
 *
 * Runs the default offline plan (scripted_known + seeded_random × faulty + fixed × seeds) into a
 * fresh evidence store at <store-dir>/<comparisonId>.sqlite (§9.5), exports the report by reading
 * the benchmark tables back, and validates it with validateComparisonV2. The export is always
 * written, so a crashed comparison still exports (and fails validation with missing_run). The
 * summarizeArmsV2 output is printed/written only when validation has no issues.
 * Offline only: no LLM, network or Thor calls. Paid spend is $0.
 *
 * Flags:
 *   --comparison-id <id>  default rb015-offline-v2; an id that already has a store file is refused
 *   --store-dir <dir>     default artifacts/rb-015
 *   --out <path>          report JSON (default <store-dir>/<comparisonId>.report.json)
 *   --seeds a,b,c         explorer seeds (default 5 fixed seeds)
 *   --max-actions <n>     per-run action budget (default 200)
 *   --with-llm-arms       also plan llm_single/llm_dual cells; they are recorded as not_run
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { buildDefaultOfflinePlan, runComparison, type OfflineRunTrace } from "@rulebreak/campaign";
import { summarizeArmsV2, validateComparisonV2, type ArmSummaryV2 } from "@rulebreak/contracts";
import { EvidenceStore } from "@rulebreak/evidence";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const HONESTY_CAPS = [
  "Offline engineering check on the in-repo synthetic trade fixture only (buildId rulebreak-economy-0.1.0, one planted defect).",
  "Paid spend: $0. No LLM, network or Thor calls were made.",
  "llm_single and llm_dual are not_run (live gate not approved); they are not zero-finding results.",
  "not_run rows carry live provenance per contract section 1. Consumers must check outcome before provenance.",
  "Thor-over-SSH runs are not llm_dual results.",
  "G4: Not run. The pitch is not closed.",
  "0 clean-target false confirmations is guaranteed by how the fixture is built, not measured: synthetic-trade-fixed has no reachable invariant violation, so a fixed run never produces a candidate to confirm.",
  "scripted_known was written to hit this exact defect, so its faulty-target rate is expected by construction.",
  "totalWallSeconds depends on the machine.",
  "Not evidence of general exploit-detection performance.",
];

/** Best-effort code provenance for the snapshot. Never fails the run. */
function codeCommit(): { commit: string | null; dirty: boolean | null } {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  if (head.status !== 0) return { commit: null, dirty: null };
  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=no", "--", "packages", "scripts"], {
    encoding: "utf8",
  });
  return { commit: head.stdout.trim(), dirty: status.status === 0 ? status.stdout.trim().length > 0 : null };
}

function table(summary: ArmSummaryV2[]): string {
  const cols: (keyof ArmSummaryV2)[] = [
    "arm",
    "planned",
    "executed",
    "notRun",
    "faultyRuns",
    "faultyConfirmed",
    "faultyNotReproduced",
    "cleanRuns",
    "cleanFalseConfirmations",
    "cleanCandidates",
    "cleanNotReproduced",
    "errors",
    "aborted",
    "wallTimeCutoffs",
    "distinctInvariants",
    "medianActionsToFirstConfirmed",
    "medianSampleSize",
    "totalCostUsd",
    "totalWallSeconds",
    "comparable",
    "comparableFullBudget",
  ];
  const fmt = (v: unknown) =>
    v === null ? "n/a" : typeof v === "number" && !Number.isInteger(v) ? v.toFixed(3) : String(v);
  return [
    `| ${cols.join(" | ")} |`,
    `| ${cols.map(() => "---").join(" | ")} |`,
    ...summary.map((s) => `| ${cols.map((c) => fmt(s[c])).join(" | ")} |`),
  ].join("\n");
}

function main(): number {
  if (process.env.RULEBREAK_LIVE_ENABLED === "true") {
    console.error("bench:rb015 is offline only; refusing RULEBREAK_LIVE_ENABLED=true");
    return 1;
  }
  const seeds = argValue("--seeds")?.split(",").map((s) => s.trim()).filter(Boolean);
  const maxActions = argValue("--max-actions");
  const comparisonIdArg = argValue("--comparison-id");
  const plan = buildDefaultOfflinePlan({
    ...(comparisonIdArg ? { comparisonId: comparisonIdArg } : {}),
    ...(seeds && seeds.length ? { explorerSeeds: seeds } : {}),
    ...(maxActions ? { maxActions: Number(maxActions) } : {}),
    includeLlmArms: process.argv.includes("--with-llm-arms"),
  });
  const comparisonId = plan.comparisonId;
  const storeDir = resolve(argValue("--store-dir") ?? "artifacts/rb-015");
  const dbPath = join(storeDir, `${comparisonId}.sqlite`);
  const out = resolve(argValue("--out") ?? join(storeDir, `${comparisonId}.report.json`));

  // One comparison id per store (§9.5): a fresh file per comparison, never reused.
  if (existsSync(dbPath)) {
    console.error(
      `bench:rb015 refusing comparison ${comparisonId}: ${dbPath} already exists. ` +
        "Pass a new --comparison-id or move the old store aside.",
    );
    return 1;
  }
  mkdirSync(storeDir, { recursive: true });
  const store = new EvidenceStore(dbPath);
  const code = codeCommit();

  let crash: string | undefined;
  let traces: OfflineRunTrace[] | undefined;
  try {
    traces = runComparison(plan, { store }).traces;
  } catch (err) {
    crash = err instanceof Error ? err.message : String(err);
  }

  if (!store.hasBenchmarkComparison(comparisonId)) {
    console.error(`bench:rb015 FAILED before the plan row was written: ${crash ?? "unknown"}`);
    store.close();
    return 1;
  }
  // The report is an export of the store, written even after a crash.
  const report = store.exportBenchmarkReport(comparisonId);
  store.close();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  const { issues, warnings } = validateComparisonV2(report);

  console.log(`RB-015 offline baseline (contract v2): ${comparisonId}`);
  console.log(`code commit: ${code.commit ?? "unknown"}${code.dirty ? " (+ uncommitted changes in packages/ or scripts/)" : ""}`);
  console.log(`store: ${dbPath}\nwrote ${out}`);
  if (crash) console.error(`bench:rb015 harness crash: ${crash}`);
  if (issues.length > 0) {
    console.error(`bench:rb015 FAILED validateComparisonV2 with ${issues.length} issue(s):`);
    for (const issue of issues)
      console.error(`  - ${issue.code}${issue.runId ? ` [${issue.runId}]` : ""}: ${issue.message}`);
    return 1;
  }
  if (crash) return 1;

  const summary = summarizeArmsV2(report);
  const summaryPath = out.replace(/\.json$/, "") + ".summary.json";
  writeFileSync(
    summaryPath,
    `${JSON.stringify(
      { comparisonId, contractVersion: 2, code, validationIssues: [], validationWarnings: warnings, honestyCaps: HONESTY_CAPS, summary },
      null,
      2,
    )}\n`,
  );
  const tracePath = out.replace(/\.json$/, "") + ".traces.json";
  writeFileSync(tracePath, `${JSON.stringify(traces ?? [], null, 2)}\n`);

  console.log(
    `runs: ${report.runs.length} (planned ${report.plan.plannedRuns.length}); validateComparisonV2: clean, ${warnings.length} warning(s)\n`,
  );
  for (const w of warnings) console.log(`  warning ${w.code}${w.runId ? ` [${w.runId}]` : ""}: ${w.message}`);
  console.log(table(summary));
  console.log("\nPer-run outcomes:");
  for (const r of report.runs)
    console.log(
      `  ${r.runId}: ${r.outcome}/${r.stopReason} actions=${r.actionsTaken} tools=${r.toolsUsed.join(",") || "-"} costUsd=${r.costUsd}` +
        (r.findings.length
          ? ` findings=${r.findings.map((f) => `${f.invariantId}@${f.firstActionIndex}:${f.status}`).join(",")}`
          : "") +
        (r.notRunReason ? ` (${r.notRunReason})` : "") +
        (r.errorMessage ? ` (error: ${r.errorMessage})` : ""),
    );
  console.log(`\nHonesty caps:\n${HONESTY_CAPS.map((c) => `  - ${c}`).join("\n")}`);
  console.log(`\nwrote ${summaryPath}\nwrote ${tracePath}`);
  return 0;
}

process.exit(main());
