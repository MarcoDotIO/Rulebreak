import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EvidenceBundle } from "./replay.js";

export type ExportedBundlePaths = {
  directory: string;
  findingPath: string;
  tracePath: string;
  initialStatePath: string;
  readmePath: string;
  regressionTestPath: string;
};

export function exportEvidenceBundle(
  bundle: EvidenceBundle,
  directory: string,
): ExportedBundlePaths {
  mkdirSync(directory, { recursive: true });
  const findingPath = join(directory, "finding.json");
  const tracePath = join(directory, "trace.json");
  const initialStatePath = join(directory, "initial-state.json");
  const readmePath = join(directory, "README.md");
  const regressionTestPath = join(directory, "regression.test.ts");

  writeFileSync(findingPath, JSON.stringify(bundle.finding, null, 2) + "\n");
  writeFileSync(
    tracePath,
    JSON.stringify(
      {
        sourceCampaignId: bundle.sourceCampaignId,
        harnessVersion: bundle.harnessVersion,
        violation: bundle.violation,
        actions: bundle.trace,
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(initialStatePath, JSON.stringify(bundle.initialState, null, 2) + "\n");
  writeFileSync(readmePath, renderReadme(bundle));
  writeFileSync(regressionTestPath, renderRegressionTest(bundle));

  return {
    directory,
    findingPath,
    tracePath,
    initialStatePath,
    readmePath,
    regressionTestPath,
  };
}

function renderReadme(bundle: EvidenceBundle): string {
  return `# Evidence bundle — ${bundle.finding.findingId}

**Mode:** ${bundle.finding.mode}  
**Status:** ${bundle.finding.status}  
**Invariant:** ${bundle.violation.invariantId}  
**Harness:** ${bundle.harnessVersion}

## Reproduce offline

\`\`\`bash
npm test -- tests/integration/replay-regression.test.ts
\`\`\`

Or against this bundle directory using the Rulebreak replay harness (matching version ${bundle.harnessVersion}).

## Files

- \`finding.json\` — finding record
- \`trace.json\` — ordered logical actions
- \`initial-state.json\` — starting world
- \`regression.test.ts\` — static safety regression template (fails on faulty, passes on fixed)

## Limitations

Synthetic bundled target only. This is executable with the matching Rulebreak harness, not a dependency-free universal studio backend test.
`;
}

function renderRegressionTest(bundle: EvidenceBundle): string {
  // Static template filled with validated JSON literals — no model-generated code.
  const traceLiteral = JSON.stringify(
    bundle.trace.map((step) => ({
      kind: step.envelope.kind,
      actorId: step.envelope.actorId,
      params: step.envelope.params,
    })),
    null,
    2,
  );
  const invariantId = bundle.violation.invariantId;
  const seed = bundle.initialState.seed;
  return `import { describe, expect, it } from "vitest";
import {
  createFaultyFixtureTargetAdapter,
  createFixedTargetAdapter,
} from "@rulebreak/economy";
import { verifyTransition } from "@rulebreak/verifier";

/**
 * Safety regression exported from ${bundle.finding.findingId}.
 * Asserts the approved safety property: the recorded violation appears on the
 * faulty target and does not appear on the fixed target.
 */
const TRACE = ${traceLiteral} as const;
const EXPECTED_INVARIANT = ${JSON.stringify(invariantId)} as const;
const SEED = ${JSON.stringify(seed)} as const;

function run(fixture: "fixed" | "faulty") {
  const target =
    fixture === "faulty"
      ? createFaultyFixtureTargetAdapter()
      : createFixedTargetAdapter();
  target.initialize({
    schemaVersion: 1,
    players: ["player-a", "player-b"],
    startingCurrency: 100,
    uniqueItemId: "relic-001",
    ownerId: "player-a",
    seed: SEED,
  });
  let violationId: string | null = null;
  for (const [index, step] of TRACE.entries()) {
    const envelope = {
      schemaVersion: 1 as const,
      campaignId: "regression",
      worldId: "world-regression",
      actorId: step.actorId,
      logicalActionId: \`reg-\${index + 1}\`,
      transportDispatchId: \`reg-d-\${index + 1}\`,
      kind: step.kind,
      params: step.params,
    };
    const execution = target.execute(envelope);
    const verification = verifyTransition({
      preState: execution.preState,
      envelope,
      result: execution.result,
      postState: execution.postState,
    });
    if (!verification.ok) {
      violationId = verification.violations[0]?.invariantId ?? null;
      break;
    }
  }
  return violationId;
}

describe("exported safety regression: ${bundle.finding.findingId}", () => {
  it("fails safety on the faulty target (violation present)", () => {
    expect(run("faulty")).toBe(EXPECTED_INVARIANT);
  });

  it("passes safety on the fixed target (no violation)", () => {
    expect(run("fixed")).toBeNull();
  });
});
`;
}
