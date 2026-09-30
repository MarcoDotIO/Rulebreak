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
 *   --reward-pair         RB-016 (npm run bench:rb016): run the synthetic reward pair with
 *                         rulebreak-reward-v1 instead. Its own settings key and comparison id
 *                         (default rb-016-reward-offline-v1, store dir artifacts/rb-016). Only
 *                         scripted_known executes; seeded_random and the LLM arms are always planned
 *                         and recorded as not_run (no reward_claim tool). Not-run arms are reported
 *                         as not_run, never as zeros.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  buildDefaultOfflinePlan,
  buildRewardOfflinePlan,
  runComparison,
  type OfflineRunTrace,
} from "@rulebreak/campaign";
import {
  summarizeArmsV2,
  validateComparisonV2,
  type ArmSummaryV2,
  type ComparisonReportV2,
} from "@rulebreak/contracts";
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

const REWARD_HONESTY_CAPS = [
  "Offline engineering check on the in-repo synthetic reward fixture only (buildId rulebreak-economy-0.1.0, rule pack rulebreak-reward-v1, one planted defect: the RB-016 double-claim).",
  "Paid spend: $0. No LLM, network or Thor calls were made.",
  "scripted_known was hand-written to hit INV-006 at action 4. Its confirmations are not explorer-discovered and are not a detection rate; the faulty-target result is expected by construction, and every seed runs the same 4 steps.",
  "seeded_random, llm_single and llm_dual are not_run: no explorer has a reward_claim tool (RB-018, parked). They are not zero-finding results and have no metrics.",
  "not_run rows carry their arm's usual provenance per contract section 1. Consumers must check outcome before provenance.",
  "0 clean-target false confirmations is guaranteed by how the fixture is built, not measured: synthetic-reward-fixed refuses a second claim of the same reward by the same player, so a fixed run never produces a candidate to confirm.",
  "This is a separate comparison with its own settings key; it is not a rerun of the RB-015 v2 trade comparison and its numbers are not comparable to it.",
  "Thor-over-SSH runs are not llm_dual results.",
  "G4: Not run. The pitch is not closed.",
  "totalWallSeconds depends on the machine.",
  "Not evidence of general exploit-detection performance.",
];

type ArmSummaryOrNotRun =
  | ArmSummaryV2
  | { arm: ArmSummaryV2["arm"]; planned: number; executed: 0; notRun: number; status: "not_run"; notRunReason: string };

/** Arms that executed nothing get a not_run stub instead of zero-valued metrics. */
function summaryWithNotRunStubs(report: ComparisonReportV2, summary: ArmSummaryV2[]): ArmSummaryOrNotRun[] {
  return summary.map((s) => {
    if (s.executed > 0) return s;
    const reasons = [...new Set(report.runs.filter((r) => r.arm === s.arm).map((r) => r.notRunReason ?? ""))];
    return { arm: s.arm, planned: s.planned, executed: 0, notRun: s.notRun, status: "not_run", notRunReason: reasons.join("; ") };
  });
}

/** Best-effort code provenance for the snapshot. Never fails the run. */
function codeCommit(): { commit: string | null; dirty: boolean | null } {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  if (head.status !== 0) return { commit: null, dirty: null };
  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=no", "--", "packages", "scripts"], {
    encoding: "utf8",
  });
  return { commit: head.stdout.trim(), dirty: status.status === 0 ? status.stdout.trim().length > 0 : null };
}

function table(summary: ArmSummaryOrNotRun[]): string {
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
    ...summary.map(
      (s) =>
        `| ${cols
          .map((c) =>
            "status" in s && !["arm", "planned", "executed", "notRun"].includes(c) ? "not_run" : fmt((s as ArmSummaryV2)[c]),
          )
          .join(" | ")} |`,
    ),
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
  const rewardPair = process.argv.includes("--reward-pair");
  const planOptions = {
    ...(comparisonIdArg ? { comparisonId: comparisonIdArg } : {}),
    ...(seeds && seeds.length ? { explorerSeeds: seeds } : {}),
    ...(maxActions ? { maxActions: Number(maxActions) } : {}),
  };
  const plan = rewardPair
    ? buildRewardOfflinePlan(planOptions)
    : buildDefaultOfflinePlan({ ...planOptions, includeLlmArms: process.argv.includes("--with-llm-arms") });
  const honestyCaps = rewardPair ? REWARD_HONESTY_CAPS : HONESTY_CAPS;
  const comparisonId = plan.comparisonId;
  const storeDir = resolve(argValue("--store-dir") ?? (rewardPair ? "artifacts/rb-016" : "artifacts/rb-015"));
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

  console.log(
    rewardPair
      ? `RB-016 reward pair, offline (contract v2): ${comparisonId}`
      : `RB-015 offline baseline (contract v2): ${comparisonId}`,
  );
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

  const summary: ArmSummaryOrNotRun[] = rewardPair
    ? summaryWithNotRunStubs(report, summarizeArmsV2(report))
    : summarizeArmsV2(report);
  const summaryPath = out.replace(/\.json$/, "") + ".summary.json";
  writeFileSync(
    summaryPath,
    `${JSON.stringify(
      { comparisonId, contractVersion: 2, code, validationIssues: [], validationWarnings: warnings, honestyCaps, summary },
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
    if (rewardPair && r.outcome === "not_run") console.log(`  ${r.runId}: not_run (${r.notRunReason ?? "no reason recorded"})`);
    else console.log(
      `  ${r.runId}: ${r.outcome}/${r.stopReason} actions=${r.actionsTaken} tools=${r.toolsUsed.join(",") || "-"} costUsd=${r.costUsd}` +
        (r.findings.length
          ? ` findings=${r.findings.map((f) => `${f.invariantId}@${f.firstActionIndex}:${f.status}`).join(",")}`
          : "") +
        (r.notRunReason ? ` (${r.notRunReason})` : "") +
        (r.errorMessage ? ` (error: ${r.errorMessage})` : ""),
    );
  console.log(`\nHonesty caps:\n${honestyCaps.map((c) => `  - ${c}`).join("\n")}`);
  console.log(`\nwrote ${summaryPath}\nwrote ${tracePath}`);
  return 0;
}

process.exit(main());
