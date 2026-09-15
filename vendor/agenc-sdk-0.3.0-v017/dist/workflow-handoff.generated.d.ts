/**
 * Generated public metadata contract for durable workflow handoffs.
 * Keep synchronized with
 * `runtime/src/agents/workflow-handoff-artifact.v1.schema.json`.
 */
export declare const AGENC_WORKFLOW_HANDOFF_ARTIFACT_FORMAT_VERSION: 1;
export declare const AGENC_WORKFLOW_HANDOFF_ARTIFACT_KIND: "workflow_handoff";
export declare const AGENC_WORKFLOW_HANDOFF_COMPATIBILITY_EPOCH: "workflow_handoff.v1/state-schema.22";
export declare const AGENC_MAX_WORKFLOW_HANDOFF_ARTIFACT_BYTES: 16777216;
export declare const AGENC_MAX_WORKFLOW_STEP_RESULT_TOKENS: 131072;
export declare const AGENC_MAX_WORKFLOW_STEP_PREVIEW_BYTES: 2048;
export declare const AGENC_MAX_WORKFLOW_HANDOFF_OWNER_FIELD_UTF8_BYTES: 1024;
export interface WorkflowHandoffOwner {
    readonly run_id: string;
    readonly workflow_id: string;
    readonly producer_step_id: string;
}
export interface WorkflowHandoffArtifact {
    readonly format_version: 1;
    readonly kind: "workflow_handoff";
    readonly compatibility_epoch: "workflow_handoff.v1/state-schema.22";
    readonly artifact_id: string;
    readonly owner: WorkflowHandoffOwner;
    readonly digest: `sha256:${string}`;
    readonly byte_length: number;
    readonly token_count: number;
    readonly media_type: "text/plain";
    readonly encoding: "utf-8";
    readonly storage_ref: string;
    readonly created_at_ms: number;
    readonly committed_at_ms: number;
    readonly commit_sequence: number;
    readonly preview: string;
    readonly preview_truncated: boolean;
}
export declare class WorkflowHandoffArtifactValidationError extends Error {
    readonly code: "WORKFLOW_HANDOFF_SCHEMA";
    constructor(message: string);
}
/** Strict dependency-free validator for the generated public SDK contract. */
export declare function validateWorkflowHandoffArtifact(value: unknown): WorkflowHandoffArtifact;
//# sourceMappingURL=workflow-handoff.generated.d.ts.map