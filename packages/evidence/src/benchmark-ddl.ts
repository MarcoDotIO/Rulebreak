/**
 * RB-015-v2 benchmark tables. Verbatim copy of the SQL block in
 * docs/contracts/rb-015-baseline.md §9.5 (a test asserts they stay identical).
 */
export const BENCHMARK_TABLES_DDL = `CREATE TABLE IF NOT EXISTS benchmark_comparisons (
  comparison_id    TEXT PRIMARY KEY,
  contract_version INTEGER NOT NULL CHECK (contract_version = 2),
  settings_key     TEXT NOT NULL,
  plan_json        TEXT NOT NULL            -- ComparisonPlan, canonical JSON
    CHECK (json_valid(plan_json) AND json_extract(plan_json, '$.comparisonId') = comparison_id)
);

CREATE TABLE IF NOT EXISTS benchmark_runs (
  comparison_id  TEXT NOT NULL REFERENCES benchmark_comparisons(comparison_id),
  run_id         TEXT NOT NULL,
  arm            TEXT NOT NULL,
  target_id      TEXT NOT NULL,
  explorer_seed  TEXT NOT NULL,
  outcome        TEXT NOT NULL,
  stop_reason    TEXT NOT NULL,
  campaign_id    TEXT REFERENCES campaigns(campaign_id),  -- NULL when no campaign row was created
  record_json    TEXT NOT NULL,           -- RunRecordV2, canonical JSON
  PRIMARY KEY (comparison_id, run_id),
  UNIQUE (comparison_id, arm, target_id, explorer_seed),
  CHECK (outcome <> 'not_run' OR campaign_id IS NULL),
  CHECK (
    json_valid(record_json)
    AND json_extract(record_json, '$.comparisonId') = comparison_id
    AND json_extract(record_json, '$.runId') = run_id
    AND json_extract(record_json, '$.arm') = arm
    AND json_extract(record_json, '$.target.targetId') = target_id
    AND json_extract(record_json, '$.explorerSeed') = explorer_seed
    AND json_extract(record_json, '$.outcome') = outcome
    AND json_extract(record_json, '$.stopReason') = stop_reason
  )
);

CREATE TRIGGER IF NOT EXISTS benchmark_comparisons_no_update
  BEFORE UPDATE ON benchmark_comparisons BEGIN SELECT RAISE(ABORT, 'benchmark_comparisons is write-once'); END;
CREATE TRIGGER IF NOT EXISTS benchmark_comparisons_no_delete
  BEFORE DELETE ON benchmark_comparisons BEGIN SELECT RAISE(ABORT, 'benchmark_comparisons is write-once'); END;
CREATE TRIGGER IF NOT EXISTS benchmark_runs_no_update
  BEFORE UPDATE ON benchmark_runs BEGIN SELECT RAISE(ABORT, 'benchmark_runs is insert-only'); END;
CREATE TRIGGER IF NOT EXISTS benchmark_runs_no_delete
  BEFORE DELETE ON benchmark_runs BEGIN SELECT RAISE(ABORT, 'benchmark_runs is insert-only'); END;

-- REPLACE deletes the old row without firing DELETE triggers, so block re-inserts of an existing key.
CREATE TRIGGER IF NOT EXISTS benchmark_comparisons_no_replace
  BEFORE INSERT ON benchmark_comparisons
  WHEN EXISTS (SELECT 1 FROM benchmark_comparisons WHERE comparison_id = NEW.comparison_id)
  BEGIN SELECT RAISE(ABORT, 'benchmark_comparisons is write-once'); END;
CREATE TRIGGER IF NOT EXISTS benchmark_runs_no_replace
  BEFORE INSERT ON benchmark_runs
  WHEN EXISTS (
    SELECT 1 FROM benchmark_runs
    WHERE comparison_id = NEW.comparison_id
      AND (run_id = NEW.run_id
        OR (arm = NEW.arm AND target_id = NEW.target_id AND explorer_seed = NEW.explorer_seed))
  )
  BEGIN SELECT RAISE(ABORT, 'benchmark_runs is insert-only'); END;
`;
