/**
 * Notification → typed prompt-event mapping shared by every transport.
 *
 * The daemon delivers session activity as JSON-RPC notifications
 * (`event.message_chunk`, `event.tool_request`, `event.permission_request`,
 * `event.user_input_request`, `event.mcp_elicitation_request`,
 * `event.agent_status`, `event.session_event`). The subprocess transport's
 * `--output-format stream-json` lines carry the exact same notification
 * objects under their `event` field, so one mapper serves both.
 *
 * Terminal-status and message-chunk detection intentionally mirrors the
 * CLI's daemon one-shot path (`runtime/src/bin/agenc.ts`:
 * `daemonOneShotMessageChunk` / `daemonOneShotFinalStatus`) so an embedder
 * sees the same text and the same completion semantics as `agenc -p`.
 */
import { type JsonObject, type JsonValue } from "./protocol.js";
export type AgencStopReason = "completed" | "errored" | "stopped";
/** Durable identity carried unchanged from a daemon event notification. */
export interface AgencPromptEventIdentity {
    readonly eventId?: string;
    readonly sequence?: number;
    readonly runId?: string;
    readonly historyEpoch?: string;
    readonly turnId?: string;
    readonly clientMessageId?: string;
    readonly messageId?: string;
}
/** One streamed event observed while a prompt turn runs. */
export type AgencPromptEvent = AgencPromptEventIdentity & ({
    readonly type: "text";
    readonly delta: string;
    readonly streamId?: string;
} | {
    readonly type: "message_committed";
    readonly text: string;
} | {
    /** Durable transcript replacement; consumers should fetch v2 anew. */
    readonly type: "history_reset";
    readonly reason: "cleared" | "partial_compact" | "rewind" | "compaction_rollback";
} | {
    readonly type: "tool_call";
    readonly requestId: string;
    readonly toolName: string;
    readonly turnId?: string;
    readonly input?: JsonValue;
    readonly recoveryCategory?: string;
} | {
    readonly type: "permission_request";
    readonly requestId: string;
    readonly toolName?: string;
    readonly permissions: readonly string[];
    readonly input?: JsonValue;
    readonly reason?: string;
} | {
    readonly type: "elicitation_request";
    readonly kind: "request_user_input" | "mcp";
    readonly requestId: string | number;
    readonly serverName?: string;
    readonly questions?: readonly JsonObject[];
    readonly request?: JsonObject;
    readonly clientAction?: JsonObject;
} | {
    readonly type: "status";
    readonly status?: string;
    readonly runStatus?: string;
    readonly message?: string;
} | {
    /** Detached live-buffer loss; reattach with the durable run cursor. */
    readonly type: "gap";
    readonly kind: "event_gap";
    readonly reason: "retention";
    readonly sessionId: string;
    readonly runId?: string;
    readonly afterSequence?: number;
    readonly firstAvailableSequence?: number;
    readonly retiredCount: number;
} | {
    readonly type: "session_event";
    readonly event: JsonObject;
});
export interface AgencUsage extends JsonObject {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
    readonly costUsd: number;
}
/** Final outcome of one prompt turn. */
export interface AgencPromptResult {
    readonly stopReason: AgencStopReason;
    /** 0 success, 1 error, 130 stopped/interrupted — mirrors `agenc -p`. */
    readonly exitCode: number;
    /** The turn's final assistant message (or accumulated streamed text). */
    readonly finalMessage: string;
    /** Permission requests that were auto- or callback-denied during the turn. */
    readonly deniedPermissionRequestIds: readonly string[];
    readonly usage?: JsonObject;
    readonly cacheStats?: JsonObject;
}
export interface AgencTerminalStatus {
    readonly code: number;
    readonly message?: string;
}
/**
 * Extract streamed assistant text from a daemon notification. Mirrors the
 * CLI's `daemonOneShotMessageChunk`.
 */
export declare function messageChunkFromNotification(message: JsonObject): string | null;
/**
 * Detect the terminal status of a turn from a daemon notification. Mirrors
 * the CLI's `daemonOneShotFinalStatus`: `event.agent_status` with a terminal
 * run status, or a nested transcript `turn_complete`/`error` event.
 */
export declare function terminalStatusFromNotification(message: JsonObject): AgencTerminalStatus | null;
export declare function stopReasonFromExitCode(code: number): AgencStopReason;
/**
 * Map a raw daemon notification to a typed prompt event. Returns `null` for
 * notifications that carry no session-facing meaning (e.g. realtime audio).
 */
export declare function promptEventFromNotification(message: JsonObject): AgencPromptEvent | null;
/** sessionId carried by a daemon notification, if any. */
export declare function sessionIdFromNotification(message: JsonObject): string | null;
//# sourceMappingURL=events.d.ts.map