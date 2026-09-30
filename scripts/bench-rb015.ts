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
 *   --rb018-reward        RB-018 (npm run bench:rb018): the same reward pair and settings key, comparison
 *                         rb-018-reward-offline-v1 (store dir artifacts/rb-018), 5 plan-wide seeds.
 *                         scripted_known and seeded_random (reward generator) execute; the LLM arms are
 *                         not_run. seeded_random is reported as the number of independent seeds
 *                         that confirmed INV-006 (rb018SeedCountText), never as a rate;
 *                         scripted_known is labelled as n repeats of one deterministic script.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  RB016_COMPARABLE_NOTE,
  DEFAULT_RB018_SEEDS,
  RB018_COMPARABLE_NOTE,
  RB018_RESULT_CAVEAT,
  RB018_SEEDED_RANDOM_REWARD_GENERATOR_ID,
  buildDefaultOfflinePlan,
  buildRb018RewardPlan,
  buildRewardOfflinePlan,
  rb018ScriptedRepeatsLabel,
  rb018SeedCountText,
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
  "scripted_known was hand-written to hit INV-006 at action 4: the scripted run confirmed INV-006, by construction. It is not explorer-discovered and not a detection rate. The plan uses one seed because every seed would run the same four steps.",
  "seeded_random, llm_single and llm_dual are not_run: no explorer has a reward_claim tool (RB-018, parked). They are not zero-finding results and have no metrics.",
  "not_run rows carry their arm's usual provenance per contract section 1. Consumers must check outcome before provenance.",
  "0 clean-target false confirmations is guaranteed by how the fixture is built, not measured: synthetic-reward-fixed refuses a second claim of the same reward by the same player, so a fixed run never produces a candidate to confirm.",
  "This is a separate comparison with its own settings key; it is not a rerun of the RB-015 v2 trade comparison.",
  RB016_COMPARABLE_NOTE,
  "Thor-over-SSH runs are not llm_dual results.",
  "G4: Not run. The pitch is not closed.",
  "totalWallSeconds depends on the machine.",
  "Not evidence of general exploit-detection performance.",
];

function rb018HonestyCaps(seeds: number): string[] {
  return [
    "Offline engineering check on the in-repo synthetic reward fixture only (buildId rulebreak-economy-0.1.0, rule pack rulebreak-reward-v1, one planted defect: the RB-016 double-claim).",
    "Paid spend: $0. No LLM, network or Thor calls were made.",
    `seeded_random uses the RB-018 reward generator ${RB018_SEEDED_RANDOM_REWARD_GENERATOR_ID} with ${seeds} independent seeds. Its results are counts of seeds on one synthetic fixture pair: ${RB018_RESULT_CAVEAT}.`,
    `scripted_known: ${rb018ScriptedRepeatsLabel(seeds)}. Seeds are set for the whole plan, so it runs at the same seeds, but it plays the same four hand-written steps each time and hits INV-006 at action 4 by construction. Its faultyConfirmed count is a count of repeats, not of independent results.`,
    "llm_single and llm_dual are not_run (live gate not approved; reward_claim is offline-only for scripted_known and seeded_random). They are not zero-finding results and have no metrics.",
    "not_run rows carry their arm's usual provenance per contract section 1. Consumers must check outcome before provenance.",
    "0 clean-target false confirmations is guaranteed by how the fixture is built, not measured: synthetic-reward-fixed refuses a second claim of the same reward by the same player, so a fixed run never produces a candidate to confirm.",
    "This comparison shares its settings key with RB-016 (settings exclude comparisonId, arms and generatorId) but is a separate comparison, not a rerun of RB-016 or RB-015.",
    RB018_COMPARABLE_NOTE,
    "Thor-over-SSH runs are not llm_dual results.",
    "G4: Not run. The pitch is not closed.",
    "totalWallSeconds depends on the machine.",
    "Not evidence of general exploit-detection performance, and no security claim about the target or Rulebreak.",
  ];
}

/** Seeds (out of the plan's seeds) on which an arm confirmed INV-006, per fixture mode. */
function confirmedSeeds(report: ComparisonReportV2, arm: string, mode: "faulty" | "fixed"): number {
  return new Set(
    report.runs
      .filter(
        (r) =>
          r.arm === arm &&
          r.target.fixtureMode === mode &&
          r.findings.some((f) => f.invariantId === "INV-006" && f.status === "confirmed"),
      )
      .map((r) => r.explorerSeed),
  ).size;
}

/** Median of a non-empty list of numbers. */
function median(xs: number[]): number {
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

/** RB-018 result lines. Counts are worded by rb018SeedCountText, never as a rate; scripted_known is repeats, not samples. */
function rb018Results(report: ComparisonReportV2) {
  const n = report.plan.explorerSeeds.length;
  const defaultSeeds = report.plan.explorerSeeds.join(",") === DEFAULT_RB018_SEEDS.join(",");
  const caveat = defaultSeeds
    ? RB018_RESULT_CAVEAT
    : "operator-chosen seeds (--seeds) against one planted defect; not a general detection rate";
  const srFaulty = confirmedSeeds(report, "seeded_random", "faulty");
  const srFixed = confirmedSeeds(report, "seeded_random", "fixed");
  const skFaulty = confirmedSeeds(report, "scripted_known", "faulty");
  const skFixed = confirmedSeeds(report, "scripted_known", "fixed");
  // 1-based action of the first confirmed violation, per seed in plan order.
  const firstActions = report.runs
    .filter((r) => r.arm === "seeded_random" && r.target.fixtureMode === "faulty")
    .flatMap((r) => r.findings.filter((f) => f.invariantId === "INV-006" && f.status === "confirmed").slice(0, 1))
    .map((f) => f.firstActionIndex + 1);
  const firstActionText = firstActions.length
    ? ` (first violation at actions ${firstActions.join(", ")}; median of ${firstActions.length} seeds, ${median(firstActions)})`
    : "";
  const fixedRuns = report.runs.filter((r) => r.arm === "seeded_random" && r.target.fixtureMode === "fixed");
  const fullBudget =
    fixedRuns.length > 0 && fixedRuns.every((r) => r.stopReason === "max_actions")
      ? ` (every run used its full ${report.plan.settings.maxActions}-action budget)`
      : "";
  const fixedText =
    srFixed === 0
      ? `${rb018SeedCountText(0, n)}${fullBudget}, by construction: the 0 comes from how the fixture is built, not measured`
      : rb018SeedCountText(srFixed, n);
  const repeats = rb018ScriptedRepeatsLabel(n);
  const skFaultyText = skFaulty === n ? "in every repeat" : skFaulty === 0 ? "in no repeat" : `in ${skFaulty} of the ${n} repeats`;
  const skFixedText = skFixed === 0 ? "no finding in any repeat on fixed" : `a finding in ${skFixed} of the ${n} repeats on fixed`;
  return {
    seedsPerArm: n,
    caveat,
    seeded_random: {
      faultySeedsConfirmedInv006: srFaulty,
      fixedSeedsConfirmedInv006: srFixed,
      seeds: n,
      faultyFirstViolationActions: firstActions,
      text:
        `seeded_random: synthetic-reward-faulty: ${rb018SeedCountText(srFaulty, n)}${firstActionText}; ` +
        `synthetic-reward-fixed: ${fixedText}. Caveat: ${caveat}.`,
    },
    scripted_known: {
      label: repeats,
      text:
        `scripted_known (${repeats}): the script confirmed INV-006 on synthetic-reward-faulty ${skFaultyText}, by construction; ` +
        `${skFixedText}. Caveat: ${caveat}.`,
    },
    llm: `llm_single and llm_dual: not_run, no result. Caveat: ${caveat}.`,
  };
}

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
  const rb018 = process.argv.includes("--rb018-reward");
  const rewardPair = rb018 || process.argv.includes("--reward-pair");
  const planOptions = {
    ...(comparisonIdArg ? { comparisonId: comparisonIdArg } : {}),
    ...(seeds && seeds.length ? { explorerSeeds: seeds } : {}),
    ...(maxActions ? { maxActions: Number(maxActions) } : {}),
  };
  const plan = rb018
    ? buildRb018RewardPlan(planOptions)
    : rewardPair
    ? buildRewardOfflinePlan(planOptions)
    : buildDefaultOfflinePlan({ ...planOptions, includeLlmArms: process.argv.includes("--with-llm-arms") });
  const honestyCaps = rb018
    ? rb018HonestyCaps(plan.explorerSeeds.length)
    : rewardPair
      ? REWARD_HONESTY_CAPS
      : HONESTY_CAPS;
  const comparisonId = plan.comparisonId;
  const storeDir = resolve(
    argValue("--store-dir") ?? (rb018 ? "artifacts/rb-018" : rewardPair ? "artifacts/rb-016" : "artifacts/rb-015"),
  );
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
    rb018
      ? `RB-018 reward pair with seeded_random reward_claim, offline (contract v2): ${comparisonId}`
      : rewardPair
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
      {
        comparisonId,
        contractVersion: 2,
        code,
        validationIssues: [],
        validationWarnings: warnings,
        honestyCaps,
        ...(rb018
          ? { results: rb018Results(report), comparableNote: RB018_COMPARABLE_NOTE }
          : rewardPair
          ? { result: "scripted run confirmed INV-006, by construction", comparableNote: RB016_COMPARABLE_NOTE }
          : {}),
        summary,
      },
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
  if (rb018) {
    const results = rb018Results(report);
    console.log(
      `\nResults:\n  ${results.seeded_random.text}\n  ${results.scripted_known.text}\n  ${results.llm}\nNote: ${RB018_COMPARABLE_NOTE}`,
    );
  } else if (rewardPair)
    console.log(`\nResult: scripted run confirmed INV-006, by construction.\nNote: ${RB016_COMPARABLE_NOTE}`);
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
