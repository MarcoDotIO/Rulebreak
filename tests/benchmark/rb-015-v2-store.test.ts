import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildDefaultOfflinePlan, runComparison } from "@rulebreak/campaign";
import { BENCHMARK_TABLES_DDL, EvidenceStore } from "@rulebreak/evidence";
import { comparableSettingsKey } from "@rulebreak/contracts";
import { canonicalJson } from "@rulebreak/verifier";

function docDdl(): string {
  const doc = readFileSync(resolve("docs/contracts/rb-015-baseline.md"), "utf8");
  const sec = doc.slice(doc.indexOf("### 9.5"));
  const start = sec.indexOf("```sql\n") + "```sql\n".length;
  return sec.slice(start, sec.indexOf("```", start));
}

/** A file-backed store with one finished comparison, reopened raw (with and without recursive_triggers). */
function seededDb(recursiveTriggers: boolean) {
  const dir = mkdtempSync(join(tmpdir(), "rb015-store-"));
  const path = join(dir, "cmp.sqlite");
  const store = new EvidenceStore(path);
  const plan = buildDefaultOfflinePlan({ explorerSeeds: ["s1"] });
  runComparison(plan, { store });
  store.close();
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`PRAGMA recursive_triggers = ${recursiveTriggers ? "ON" : "OFF"};`);
  const first = db
    .prepare(`SELECT * FROM benchmark_runs WHERE comparison_id = ? ORDER BY rowid LIMIT 1`)
    .get(plan.comparisonId) as Record<string, string | null>;
  const plans = () => db.prepare(`SELECT settings_key, plan_json FROM benchmark_comparisons`).all() as Array<{ settings_key: string; plan_json: string }>;
  const runCount = () => (db.prepare(`SELECT count(*) AS n FROM benchmark_runs`).get() as { n: number }).n;
  return { db, plan, first, plans, runCount, path };
}

describe("RB-015-v2 evidence-store benchmark tables (§9.5)", () => {
  it("the store DDL is the doc's §9.5 SQL block verbatim", () => {
    expect(BENCHMARK_TABLES_DDL).toBe(docDdl());
  });

  for (const rt of [false, true]) {
    describe(`raw SQL with recursive_triggers ${rt ? "ON" : "OFF"}`, () => {
      it("rejects REPLACE / OR IGNORE on the plan row, and UPDATE / DELETE", () => {
        const { db, plan, plans, runCount } = seededDb(rt);
        const before = { plans: plans(), runs: runCount() };
        const planJson = before.plans[0]!.plan_json;
        for (const sql of [
          `INSERT OR REPLACE INTO benchmark_comparisons VALUES (?, 2, 'tampered', ?)`,
          `REPLACE INTO benchmark_comparisons VALUES (?, 2, 'tampered', ?)`,
          `INSERT OR IGNORE INTO benchmark_comparisons VALUES (?, 2, 'tampered', ?)`,
          `INSERT INTO benchmark_comparisons VALUES (?, 2, 'tampered', ?)`,
        ])
          expect(() => db.prepare(sql).run(plan.comparisonId, planJson)).toThrow(/write-once|UNIQUE/);
        expect(() => db.exec(`UPDATE benchmark_comparisons SET settings_key = 'tampered'`)).toThrow(/write-once/);
        expect(() => db.exec(`DELETE FROM benchmark_comparisons`)).toThrow(/write-once/);
        expect(() => db.exec(`UPDATE benchmark_runs SET outcome = 'no_finding'`)).toThrow(/insert-only/);
        expect(() => db.exec(`DELETE FROM benchmark_runs`)).toThrow(/insert-only/);
        expect({ plans: plans(), runs: runCount() }).toEqual(before);
        expect(before.plans[0]!.settings_key).toBe(comparableSettingsKey(plan.settings));
        db.close();
      });

      it("rejects REPLACE on an existing run id or cell, and column drift from record_json", () => {
        const { db, first, runCount } = seededDb(rt);
        const n = runCount();
        const cols = `(comparison_id, run_id, arm, target_id, explorer_seed, outcome, stop_reason, campaign_id, record_json)`;
        const vals = (o: Record<string, string | null>) => [
          o.comparison_id!, o.run_id!, o.arm!, o.target_id!, o.explorer_seed!, o.outcome!, o.stop_reason!, o.campaign_id ?? null, o.record_json!,
        ];
        // Same run id.
        for (const verb of ["INSERT OR REPLACE", "REPLACE", "INSERT OR IGNORE"])
          expect(() => db.prepare(`${verb} INTO benchmark_runs ${cols} VALUES (?,?,?,?,?,?,?,?,?)`).run(...vals(first))).toThrow(/insert-only/);
        // Same cell under a new run id (record_json kept consistent so only the cell rule can fire).
        const rec = JSON.parse(first.record_json!);
        const moved = { ...first, run_id: "new-run-id", record_json: canonicalJson({ ...rec, runId: "new-run-id" }) };
        expect(() => db.prepare(`REPLACE INTO benchmark_runs ${cols} VALUES (?,?,?,?,?,?,?,?,?)`).run(...vals(moved))).toThrow(/insert-only/);
        // Drift: a fresh cell whose indexed columns disagree with record_json.
        const freshRec = { ...rec, runId: "drift-run", explorerSeed: "drift-seed" };
        const fresh = { ...first, run_id: "drift-run", explorer_seed: "drift-seed", campaign_id: null, record_json: canonicalJson(freshRec) };
        for (const drift of [
          { outcome: "no_finding" },
          { stop_reason: "max_actions" },
          { target_id: "synthetic-trade-fixed" },
          { arm: "llm_dual" },
        ])
          expect(() => db.prepare(`INSERT INTO benchmark_runs ${cols} VALUES (?,?,?,?,?,?,?,?,?)`).run(...vals({ ...fresh, ...drift }))).toThrow(/CHECK constraint failed/);
        // The consistent fresh row itself is insertable (the checks aren't just rejecting everything).
        expect(() => db.prepare(`INSERT INTO benchmark_runs ${cols} VALUES (?,?,?,?,?,?,?,?,?)`).run(...vals(fresh))).not.toThrow();
        expect(runCount()).toBe(n + 1);
        db.close();
      });
    });
  }

  it("the store API rejects a duplicate comparison and a duplicate run", () => {
    const store = new EvidenceStore(":memory:");
    const plan = buildDefaultOfflinePlan({ explorerSeeds: ["s1"] });
    const { report } = runComparison(plan, { store });
    expect(() =>
      store.insertBenchmarkComparison({ planJson: canonicalJson(plan), settingsKey: comparableSettingsKey(plan.settings) }),
    ).toThrow(/write-once|UNIQUE/);
    expect(() => store.insertBenchmarkRun({ recordJson: canonicalJson(report.runs[0]), campaignId: null })).toThrow(/insert-only/);
    expect(() =>
      store.insertBenchmarkComparison({ planJson: canonicalJson({ ...plan, comparisonId: "other" }), settingsKey: "wrong" }),
    ).toThrow(/settingsKey/);
    expect(store.exportBenchmarkReport(plan.comparisonId).runs).toHaveLength(plan.plannedRuns.length);
  });

  it("the store API source never uses OR REPLACE / OR IGNORE", () => {
    const src = readFileSync(resolve("packages/evidence/src/sqlite-store.ts"), "utf8");
    // Code only: drop line comments and JSDoc lines, which mention REPLACE to explain the rule.
    const code = src
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l))
      .join("\n");
    expect(code).not.toMatch(/OR\s+(REPLACE|IGNORE)|REPLACE\s+INTO/i);
    expect(src).toMatch(/PRAGMA recursive_triggers = ON/);
  });
});
