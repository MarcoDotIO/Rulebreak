/** Generated public contract for event-driven workflow results. */
export const AGENC_WORKFLOW_RESULT_VERSION = 2;
export const AGENC_WORKFLOW_STEP_OUTCOMES_V2 = Object.freeze([
    "succeeded",
    "failed",
    "cancelled",
    "unknown_outcome",
    "handoff_failed",
    "blocked_dependency_failed",
    "blocked_dependency_unknown",
]);
export const AGENC_WORKFLOW_RUN_OUTCOMES_V2 = Object.freeze([
    "completed",
    "failed",
    "cancelled",
    "unknown_outcome",
]);
export const AGENC_WORKFLOW_CANCELLATION_CAUSES = Object.freeze([
    "user_abort",
    "workflow_deadline",
    "daemon_shutdown",
    "fail_fast_peer",
]);
export const AGENC_DEFAULT_WORKFLOW_MAX_CONCURRENCY = 16;
export const AGENC_MAX_WORKFLOW_MAX_CONCURRENCY = 64;
export const AGENC_DEFAULT_WORKFLOW_MAX_HANDOFF_TOKENS = 8_192;
export const AGENC_MAX_WORKFLOW_HANDOFF_TOKENS = 32_768;
export const AGENC_MAX_WORKFLOW_FINAL_RESPONSE_BYTES = 4_194_304;
//# sourceMappingURL=workflow-result.generated.js.map