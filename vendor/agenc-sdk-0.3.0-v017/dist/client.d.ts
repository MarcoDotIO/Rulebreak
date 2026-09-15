/**
 * Typed AgenC daemon client for embedders.
 *
 * The client is transport-agnostic: anything that can frame a JSON-RPC
 * request/response pair satisfies {@link AgencTransport}. Server-to-client
 * notifications are pushed in through {@link AgencClient.dispatchNotification}
 * — socket transports wire this automatically; in-process embedders pass it
 * as the dispatcher transport's `sendNotification` callback.
 */
import { type AgencDaemonErrorObject, type AgencDaemonMethod, type AgencDaemonRequest, type AgencDaemonResponse, type AgencParamsByMethod, type AgencResultByMethod, type AgentAttachResult, type AgentCreateParams, type AgentCreateResult, type AgentListParams, type AgentListResult, type AgentLogsResult, type AgentStopResult, type InitializeParams, type InitializeResult, type JsonObject, type MessageContent, type RequestId, type RunCancelResult, type RunEvidenceParams, type RunEvidenceResult, type RunReplayEvent, type RunReplayGap, type RunReplayParams, type RunReplayResult, type RunResultResult, type RunStartParams, type RunStartResult, type RunStatusResult, type SessionCreateParams, type SessionSnapshotResult, type SessionTranscriptResult, type SessionTranscriptV2Result } from "./protocol.js";
import { type AgencPromptEvent, type AgencPromptResult } from "./events.js";
import type { CsvJobReviewListParams, CsvJobReviewListResult, CsvJobReviewResolveParams, CsvJobReviewResolveResult, CsvJobReviewShowParams, CsvJobReviewShowResult } from "./csv-jobs.js";
/**
 * Minimal transport contract. The runtime's
 * `AgenCInProcessDaemonTransport` (exported from `@tetsuo-ai/runtime`)
 * satisfies this structurally, as does the built-in socket transport.
 */
export interface AgencTransport {
    request<Method extends AgencDaemonMethod>(request: AgencDaemonRequest<Method>): Promise<AgencDaemonResponse<Method>>;
    close?(): Promise<void>;
}
export declare class AgencRpcError extends Error {
    readonly code: number;
    readonly data?: unknown;
    readonly method: AgencDaemonMethod;
    readonly requestId: RequestId | null;
    constructor(error: AgencDaemonErrorObject, method: AgencDaemonMethod, requestId: RequestId | null);
}
export declare class AgencMalformedResponseError extends Error {
    readonly response: unknown;
    constructor(message: string, response: unknown);
}
export declare class AgencPromptRunInProgressError extends Error {
    readonly sessionId: string;
    readonly clientMessageId: string;
    constructor(sessionId: string, clientMessageId: string);
}
export declare class AgencDuplicateSubmissionIncompleteError extends Error {
    readonly sessionId: string;
    readonly clientMessageId: string;
    constructor(sessionId: string, clientMessageId: string);
}
export declare class AgencCapabilityUnavailableError extends Error {
    readonly capability: string;
    readonly negotiatedProtocolVersion?: string;
    constructor(capability: string, negotiatedProtocolVersion?: string);
}
/** A durable replay cursor cannot be advanced without acknowledging a gap. */
export declare class AgencRunReplayGapError extends Error {
    readonly runId: string;
    readonly cursor: AgencRunReplayCursor;
    readonly gap: RunReplayGap;
    constructor(cursor: AgencRunReplayCursor, gap: RunReplayGap);
}
/** The daemon returned a replay page that could hide loss or corruption. */
export declare class AgencRunReplayProtocolError extends Error {
    readonly runId: string;
    readonly cursor: AgencRunReplayCursor;
    readonly response?: unknown;
    constructor(message: string, cursor: AgencRunReplayCursor, response?: unknown);
}
/** Decision returned by a permission callback. */
export type AgencPermissionDecision = {
    readonly behavior: "allow";
    readonly scope?: "once" | "session" | "agent";
} | {
    readonly behavior: "deny";
    readonly reason?: string;
};
export type AgencPermissionRequest = Extract<AgencPromptEvent, {
    type: "permission_request";
}> & {
    readonly sessionId: string;
};
export type AgencElicitationRequest = Extract<AgencPromptEvent, {
    type: "elicitation_request";
}> & {
    readonly sessionId: string;
};
export type AgencPermissionCallback = (request: AgencPermissionRequest) => AgencPermissionDecision | Promise<AgencPermissionDecision>;
/**
 * Return the response payload for `elicitation.respond`, or `null` to leave
 * the request unanswered (the embedder handles it out of band).
 */
export type AgencElicitationCallback = (request: AgencElicitationRequest) => JsonObject | null | Promise<JsonObject | null>;
export interface AgencClientOptions {
    readonly transport: AgencTransport;
    readonly clientId?: string;
    readonly clientName?: string;
    readonly createRequestId?: () => RequestId;
    /** Default permission handler for every prompt run on this client. */
    readonly onPermissionRequest?: AgencPermissionCallback;
    /** Default elicitation handler for every prompt run on this client. */
    readonly onElicitationRequest?: AgencElicitationCallback;
}
export interface AgencPromptOptions {
    readonly signal?: AbortSignal;
    /** Stable caller identity used for idempotent retry and event correlation. */
    readonly clientMessageId?: string;
    /** Ask protocol-1.2+ daemons to reject cross-client overlap. */
    readonly ifBusy?: "reject";
    /**
     * Fetch `session.snapshot` after the turn completes so the result carries
     * token usage and cost. Defaults to `true`; snapshot failures are ignored.
     */
    readonly includeUsage?: boolean;
    readonly metadata?: JsonObject;
    readonly onPermissionRequest?: AgencPermissionCallback;
    readonly onElicitationRequest?: AgencElicitationCallback;
}
/** Serializable exclusive cursor for reconnecting to one durable run. */
export interface AgencRunReplayCursor {
    readonly runId: string;
    readonly afterSequence: number;
}
export type AgencRunReplayDuplicateReason = "same_identity" | "at_or_before_cursor";
export interface AgencRunReplayDuplicate {
    readonly event: RunReplayEvent;
    readonly reason: AgencRunReplayDuplicateReason;
    /** Present when the same event was already observed by this attachment. */
    readonly original?: RunReplayEvent;
}
export interface AgencRunReattachOptions extends AgencRunReplayCursor {
    /** Page size sent to run.replay. Defaults to 100; valid range is 1..200. */
    readonly limit?: number;
    /**
     * Most recently delivered identities retained with their complete
     * fingerprints for exact duplicate diagnostics. Defaults to 1,024; valid
     * range is 1..100,000. Older identities remain in a fixed-size fail-closed
     * membership filter, so reuse is rejected rather than silently accepted.
     */
    readonly identityWindow?: number;
    readonly signal?: AbortSignal;
    /** Called for harmless duplicate delivery; callback failures are ignored. */
    readonly onDuplicate?: (duplicate: AgencRunReplayDuplicate) => void;
}
export interface AgencRunReplayDiagnostics {
    readonly duplicatesDropped: number;
    /** Exact identities currently retained; never exceeds identityWindow. */
    readonly trackedIdentities: number;
    readonly identityWindow: number;
}
/**
 * Cursor-safe attachment to a durable run.
 *
 * Iteration catches up to the journal head and then ends. Persist `cursor()`
 * and pass it to a new client's `reattachRun` after reconnecting. An explicit
 * replay gap throws {@link AgencRunReplayGapError} without advancing it.
 */
export interface AgencRunAttachment extends AsyncIterable<RunReplayEvent> {
    readonly runId: string;
    cursor(): AgencRunReplayCursor;
    replay(): AsyncGenerator<RunReplayEvent, void>;
    /** Durable terminal-result read; independent of the original connection. */
    result(): Promise<RunResultResult>;
    diagnostics(): AgencRunReplayDiagnostics;
}
/**
 * One in-flight (or finished) prompt turn: an async iterable of typed
 * events plus a promise for the final result.
 */
export interface AgencPromptRun extends AsyncIterable<AgencPromptEvent> {
    readonly sessionId: string;
    /** Resolves once the daemon acknowledged `message.send`. */
    readonly accepted: Promise<{
        messageId: string;
        clientMessageId: string;
        turnId?: string;
    }>;
    /** Final outcome; resolves even when the events are never iterated. */
    result(): Promise<AgencPromptResult>;
    /** Interrupt the active turn (`session.cancelTurn`). */
    cancel(reason?: string): Promise<void>;
}
export declare class AgencSession {
    #private;
    readonly sessionId: string;
    readonly agentId: string | undefined;
    constructor(client: AgencClient, sessionId: string, agentId?: string);
    /** Send one message and stream the turn's events. */
    prompt(content: MessageContent, options?: AgencPromptOptions): AgencPromptRun;
    transcript(): Promise<SessionTranscriptResult>;
    transcriptV2(): Promise<SessionTranscriptV2Result>;
    snapshot(): Promise<SessionSnapshotResult>;
    cancelTurn(reason?: string, expectedTurnId?: string): Promise<void>;
    terminate(reason?: string): Promise<void>;
}
export declare class AgencClient {
    #private;
    constructor(options: AgencClientOptions);
    get clientId(): string;
    get initialized(): boolean;
    get negotiatedProtocolVersion(): string | undefined;
    get serverProtocolVersion(): string | undefined;
    get serverCapabilities(): InitializeResult["capabilities"] | undefined;
    /**
     * Feed a server-to-client notification into the client. Socket transports
     * call this automatically; in-process embedders wire it as the runtime
     * transport's `sendNotification` callback.
     */
    dispatchNotification(message: JsonObject): void;
    /** Subscribe to every raw daemon notification. */
    onNotification(listener: (message: JsonObject) => void): () => void;
    /** Subscribe to raw notifications for one session. */
    onSessionNotification(sessionId: string, listener: (message: JsonObject) => void): () => void;
    request<Method extends AgencDaemonMethod>(method: Method, params?: AgencParamsByMethod[Method]): Promise<AgencResultByMethod[Method]>;
    initialize(params?: InitializeParams): Promise<InitializeResult>;
    /**
     * Create a runnable daemon session and attach this client to it.
     * Prefer gateway-style `agent.create` first so `message.send` has a live
     * agent (todo-133). Falls back to bare `session.create` when `agentId` is
     * already supplied.
     */
    createSession(params?: SessionCreateParams): Promise<AgencSession>;
    /** Attach to an existing daemon-owned session by id. */
    resumeSession(sessionId: string): Promise<AgencSession>;
    /** Spawn a long-lived background agent (`agent.create`). */
    spawnAgent(params: AgentCreateParams): Promise<AgentCreateResult>;
    /**
     * Attach to a running background agent. Returns the raw attach result and
     * an {@link AgencSession} bound to the agent's first active session (or
     * `null` when the agent has none).
     */
    attachAgent(agentId: string): Promise<{
        readonly attach: AgentAttachResult;
        readonly session: AgencSession | null;
    }>;
    listAgents(params?: AgentListParams): Promise<AgentListResult>;
    stopAgent(agentId: string, reason?: string): Promise<AgentStopResult>;
    agentLogs(agentId: string): Promise<AgentLogsResult>;
    /** Read durable run state and its aggregate M3 admission state. */
    runStatus(runId: string): Promise<RunStatusResult>;
    /** Read a terminal outcome. Nonterminal runs reject with RUN_NOT_TERMINAL. */
    runResult(runId: string): Promise<RunResultResult>;
    /** Replay a bounded page of the canonical run journal. */
    replayRun(params: RunReplayParams): Promise<RunReplayResult>;
    /**
     * Reattach to a durable run from an exclusive cursor.
     *
     * The returned attachment preserves event identity, suppresses harmless
     * duplicate delivery, refuses silent cursor jumps, and exposes a durable
     * `run.result` read that does not depend on the original connection.
     */
    reattachRun(options: AgencRunReattachOptions): AgencRunAttachment;
    /** Export a bounded, hashed canonical run-journal evidence page. */
    runEvidence(params: RunEvidenceParams): Promise<RunEvidenceResult>;
    /** Tree-scoped durable run cancellation. */
    cancelRun(runId: string, reason?: string): Promise<RunCancelResult>;
    /**
     * Start the M5 verified-change workflow as a durable daemon run. Resolves
     * after the intake commit; follow the pipeline with the existing
     * status/replay/result/evidence cursor contract on the returned run id.
     */
    startRun(params: RunStartParams): Promise<RunStartResult>;
    /** List a bounded page of CSV unknown-outcome reviews. */
    listCsvJobReviews(params: CsvJobReviewListParams): Promise<CsvJobReviewListResult>;
    /** Read one bounded CSV review record. */
    showCsvJobReview(params: CsvJobReviewShowParams): Promise<CsvJobReviewShowResult>;
    /** Resolve a CSV unknown outcome with canonical operator evidence. */
    resolveCsvJobReview(params: CsvJobReviewResolveParams): Promise<CsvJobReviewResolveResult>;
    /**
     * Internal engine behind {@link AgencSession.prompt}. Exposed on the
     * client so sessions stay thin data holders.
     */
    runPrompt(sessionId: string, content: MessageContent, options?: AgencPromptOptions): AgencPromptRun;
    close(): Promise<void>;
}
export declare function createAgencClient(options: AgencClientOptions): AgencClient;
//# sourceMappingURL=client.d.ts.map