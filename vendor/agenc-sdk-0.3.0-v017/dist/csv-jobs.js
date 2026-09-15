/**
 * Standalone public types for the bounded CSV agent-job result contract.
 *
 * The result vocabulary is shared by model-facing tools and the daemon's
 * connected `csvJob.review.*` operator surface.
 */
export const AGENC_SDK_CSV_JOB_CONTRACT_VERSION = 1;
export const AGENC_SDK_CSV_OUTPUT_CONTRACT_VERSION = 1;
export const AGENC_SDK_CSV_AGENT_JOB_STATUSES = [
    "pending",
    "running",
    "completed",
    "failed",
    "cancelled",
    "needs_review",
    "finished_with_unknown_outcomes",
];
export const AGENC_SDK_CSV_AGENT_JOB_ITEM_STATUSES = [
    "pending",
    "running",
    "completed",
    "failed",
    "cancelled",
    "unknown_outcome",
];
export const AGENC_SDK_CSV_RESULT_AVAILABILITIES = [
    "not_produced",
    "available",
    "unavailable_after_review",
];
//# sourceMappingURL=csv-jobs.js.map