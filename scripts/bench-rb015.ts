/**
 * RB-015 offline seeded baseline (npm run bench:rb015).
 *
 * Runs the default offline plan (scripted_known + seeded_random × faulty + fixed × seeds),
 * validates it with validateComparison, and only then prints/writes summarizeArms output.
 * Offline only: no LLM, network or Thor calls. Paid spend is $0.
 *
 * Flags:
 *   --out <path>        report JSON (default artifacts/rb-015/offline-report.json)
 *   --seeds a,b,c       explorer seeds (default 5 fixed seeds)
 *   --max-actions <n>   per-run action budget (default 200)
 *   --with-llm-arms     also plan llm_single/llm_dual cells; they are recorded as not_run
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildDefaultOfflinePlan, runComparison } from "@rulebreak/campaign";
import { summarizeArms, validateComparison, type ArmSummary } from "@rulebreak/contracts";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const HONESTY_CAPS = [
  "Offline engineering check on the in-repo synthetic trade fixture only.",
  "Paid spend: $0. No LLM, network or Thor calls were made.",
  "llm_single and llm_dual are not_run (live gate not approved); they are not zero-finding results.",
  "Thor-over-SSH runs are not llm_dual results.",
  "G4: Not run. The pitch is not closed.",
  "This is not evidence of general exploit-detection performance, and says nothing about any real target being secure.",
];

function table(summary: ArmSummary[]): string {
  const cols: (keyof ArmSummary)[] = [
    "arm",
    "planned",
    "executed",
    "notRun",
    "faultyRuns",
    "faultyConfirmed",
    "cleanRuns",
    "cleanFalseConfirmations",
    "errors",
    "aborted",
    "distinctInvariants",
    "medianActionsToFirstConfirmed",
    "totalCostUsd",
    "totalWallSeconds",
    "comparable",
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
  const out = resolve(argValue("--out") ?? "artifacts/rb-015/offline-report.json");
  const seeds = argValue("--seeds")?.split(",").map((s) => s.trim()).filter(Boolean);
  const maxActions = argValue("--max-actions");
  const plan = buildDefaultOfflinePlan({
    ...(seeds && seeds.length ? { explorerSeeds: seeds } : {}),
    ...(maxActions ? { maxActions: Number(maxActions) } : {}),
    includeLlmArms: process.argv.includes("--with-llm-arms"),
  });

  const { report, traces } = runComparison(plan);
  const issues = validateComparison(report);
  if (issues.length > 0) {
    console.error(`bench:rb015 FAILED validateComparison with ${issues.length} issue(s):`);
    for (const issue of issues)
      console.error(`  - ${issue.code}${issue.runId ? ` [${issue.runId}]` : ""}: ${issue.message}`);
    return 1;
  }

  const summary = summarizeArms(report);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  const summaryPath = out.replace(/\.json$/, "") + ".summary.json";
  writeFileSync(
    summaryPath,
    `${JSON.stringify({ comparisonId: report.plan.comparisonId, validationIssues: [], honestyCaps: HONESTY_CAPS, summary }, null, 2)}\n`,
  );
  const tracePath = out.replace(/\.json$/, "") + ".traces.json";
  writeFileSync(tracePath, `${JSON.stringify(traces, null, 2)}\n`);

  console.log(`RB-015 offline baseline: ${report.plan.comparisonId}`);
  console.log(
    `runs: ${report.runs.length} (planned ${report.plan.plannedRuns.length}); validateComparison: clean\n`,
  );
  console.log(table(summary));
  console.log("\nPer-run outcomes:");
  for (const r of report.runs)
    console.log(
      `  ${r.runId}: ${r.outcome} actions=${r.actionsTaken} costUsd=${r.costUsd}` +
        (r.findings.length
          ? ` findings=${r.findings.map((f) => `${f.invariantId}@${f.firstActionIndex}:${f.status}`).join(",")}`
          : "") +
        (r.notRunReason ? ` (${r.notRunReason})` : ""),
    );
  console.log(`\nHonesty caps:\n${HONESTY_CAPS.map((c) => `  - ${c}`).join("\n")}`);
  console.log(`\nwrote ${out}\nwrote ${summaryPath}\nwrote ${tracePath}`);
  return 0;
}

process.exit(main());
