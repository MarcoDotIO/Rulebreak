import type {
  Finding,
  FindingStatus,
  ReplayResult,
} from "@rulebreak/contracts";
import type { EvidenceStore } from "./sqlite-store.js";

/**
 * Map a confirming (same-target / faulty) replay outcome to a durable finding status.
 * Fixed-target control outcomes (`blocked_as_expected`) never promote or demote.
 */
export function statusFromConfirmingReplay(
  outcome: ReplayResult["outcome"],
): FindingStatus | null {
  switch (outcome) {
    case "matched_violation":
      return "confirmed";
    case "diverged":
      return "inconclusive";
    case "error":
      return "not_reproduced";
    case "blocked_as_expected":
      return null;
    default:
      return null;
  }
}

/**
 * Persist candidate→confirmed (or not_reproduced / inconclusive) after a confirming replay.
 * No-ops when the finding is missing, already past candidate, or the outcome is a fixed control.
 */
export function applyConfirmingReplay(
  store: EvidenceStore,
  campaignId: string,
  replay: ReplayResult,
): Finding | null {
  const finding = store.getFinding(campaignId);
  if (!finding) return null;
  if (finding.status !== "candidate") return finding;
  if (finding.findingId !== replay.findingId) {
    throw new Error(
      `replay findingId ${replay.findingId} does not match store ${finding.findingId}`,
    );
  }

  const nextStatus = statusFromConfirmingReplay(replay.outcome);
  if (!nextStatus) return finding;

  const updated: Finding = { ...finding, status: nextStatus };
  store.updateFinding(updated);

  if (nextStatus === "confirmed") {
    const campaign = store.getCampaign(campaignId);
    if (campaign) {
      store.updateCampaign(campaign, "violation_confirmed");
    }
  }

  return updated;
}
