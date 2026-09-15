/**
 * Generated public metadata contract for durable workflow handoffs.
 * Keep synchronized with
 * `runtime/src/agents/workflow-handoff-artifact.v1.schema.json`.
 */
export const AGENC_WORKFLOW_HANDOFF_ARTIFACT_FORMAT_VERSION = 1;
export const AGENC_WORKFLOW_HANDOFF_ARTIFACT_KIND = "workflow_handoff";
export const AGENC_WORKFLOW_HANDOFF_COMPATIBILITY_EPOCH = "workflow_handoff.v1/state-schema.22";
export const AGENC_MAX_WORKFLOW_HANDOFF_ARTIFACT_BYTES = 16_777_216;
export const AGENC_MAX_WORKFLOW_STEP_RESULT_TOKENS = 131_072;
export const AGENC_MAX_WORKFLOW_STEP_PREVIEW_BYTES = 2_048;
export const AGENC_MAX_WORKFLOW_HANDOFF_OWNER_FIELD_UTF8_BYTES = 1_024;
const ARTIFACT_KEYS = Object.freeze([
    "format_version",
    "kind",
    "compatibility_epoch",
    "artifact_id",
    "owner",
    "digest",
    "byte_length",
    "token_count",
    "media_type",
    "encoding",
    "storage_ref",
    "created_at_ms",
    "committed_at_ms",
    "commit_sequence",
    "preview",
    "preview_truncated",
]);
const OWNER_KEYS = Object.freeze([
    "run_id",
    "workflow_id",
    "producer_step_id",
]);
const LONE_SURROGATE_PATTERN = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;
export class WorkflowHandoffArtifactValidationError extends Error {
    code = "WORKFLOW_HANDOFF_SCHEMA";
    constructor(message) {
        super(message);
        this.name = "WorkflowHandoffArtifactValidationError";
    }
}
/** Strict dependency-free validator for the generated public SDK contract. */
export function validateWorkflowHandoffArtifact(value) {
    const artifact = strictRecord(value, ARTIFACT_KEYS, "workflow handoff artifact");
    expectLiteral(artifact.format_version, 1, "format_version");
    expectLiteral(artifact.kind, AGENC_WORKFLOW_HANDOFF_ARTIFACT_KIND, "kind");
    expectLiteral(artifact.compatibility_epoch, AGENC_WORKFLOW_HANDOFF_COMPATIBILITY_EPOCH, "compatibility_epoch");
    const artifactId = boundedString(artifact.artifact_id, "artifact_id");
    if (!/^wh_[0-9a-f]{48}$/u.test(artifactId))
        invalid("artifact_id is invalid");
    const owner = strictRecord(artifact.owner, OWNER_KEYS, "owner");
    for (const key of OWNER_KEYS) {
        boundedString(owner[key], `owner.${key}`, AGENC_MAX_WORKFLOW_HANDOFF_OWNER_FIELD_UTF8_BYTES);
    }
    const digest = boundedString(artifact.digest, "digest");
    if (!/^sha256:[0-9a-f]{64}$/u.test(digest))
        invalid("digest is invalid");
    const byteLength = boundedInteger(artifact.byte_length, "byte_length", 0, AGENC_MAX_WORKFLOW_HANDOFF_ARTIFACT_BYTES);
    boundedInteger(artifact.token_count, "token_count", 0, AGENC_MAX_WORKFLOW_STEP_RESULT_TOKENS);
    expectLiteral(artifact.media_type, "text/plain", "media_type");
    expectLiteral(artifact.encoding, "utf-8", "encoding");
    expectLiteral(artifact.storage_ref, `workflow-handoff:${artifactId}`, "storage_ref");
    const createdAt = boundedInteger(artifact.created_at_ms, "created_at_ms", 0, Number.MAX_SAFE_INTEGER);
    const committedAt = boundedInteger(artifact.committed_at_ms, "committed_at_ms", 0, Number.MAX_SAFE_INTEGER);
    if (committedAt < createdAt)
        invalid("committed_at_ms precedes created_at_ms");
    boundedInteger(artifact.commit_sequence, "commit_sequence", 1, Number.MAX_SAFE_INTEGER);
    const preview = boundedString(artifact.preview, "preview", AGENC_MAX_WORKFLOW_STEP_PREVIEW_BYTES, true);
    if (typeof artifact.preview_truncated !== "boolean") {
        invalid("preview_truncated must be a boolean");
    }
    const previewBytes = utf8Length(preview);
    if (previewBytes > byteLength ||
        (!artifact.preview_truncated && previewBytes !== byteLength) ||
        (artifact.preview_truncated && previewBytes >= byteLength)) {
        invalid("preview length is inconsistent with byte_length");
    }
    return artifact;
}
function strictRecord(value, keys, label) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        invalid(`${label} must be an object`);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        invalid(`${label} must be a plain object`);
    }
    const names = Object.keys(value).sort();
    const expected = [...keys].sort();
    if (names.length !== expected.length ||
        names.some((name, index) => name !== expected[index])) {
        invalid(`${label} fields are invalid`);
    }
    for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined ||
            !("value" in descriptor) ||
            !descriptor.enumerable) {
            invalid(`${label}.${key} must be an enumerable data property`);
        }
    }
    return value;
}
function boundedString(value, label, maximumUtf8Bytes = Number.MAX_SAFE_INTEGER, allowEmpty = false) {
    if (typeof value !== "string" ||
        (!allowEmpty && value.length === 0) ||
        LONE_SURROGATE_PATTERN.test(value) ||
        utf8Length(value) > maximumUtf8Bytes) {
        invalid(`${label} is invalid`);
    }
    return value;
}
function boundedInteger(value, label, minimum, maximum) {
    if (!Number.isSafeInteger(value) ||
        value < minimum ||
        value > maximum) {
        invalid(`${label} is invalid`);
    }
    return value;
}
function expectLiteral(value, expected, label) {
    if (value !== expected)
        invalid(`${label} is invalid`);
}
function utf8Length(value) {
    return new TextEncoder().encode(value).byteLength;
}
function invalid(message) {
    throw new WorkflowHandoffArtifactValidationError(message);
}
//# sourceMappingURL=workflow-handoff.generated.js.map