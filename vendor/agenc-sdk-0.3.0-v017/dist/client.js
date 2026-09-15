/**
 * Typed AgenC daemon client for embedders.
 *
 * The client is transport-agnostic: anything that can frame a JSON-RPC
 * request/response pair satisfies {@link AgencTransport}. Server-to-client
 * notifications are pushed in through {@link AgencClient.dispatchNotification}
 * — socket transports wire this automatically; in-process embedders pass it
 * as the dispatcher transport's `sendNotification` callback.
 */
import { randomUUID } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { AGENC_SDK_DAEMON_PROTOCOL_VERSION, AGENC_SDK_JSON_RPC_VERSION, isJsonObject, } from "./protocol.js";
import { promptEventFromNotification, sessionIdFromNotification, stopReasonFromExitCode, terminalStatusFromNotification, } from "./events.js";
export class AgencRpcError extends Error {
    code;
    data;
    method;
    requestId;
    constructor(error, method, requestId) {
        super(error.message);
        this.name = "AgencRpcError";
        this.code = error.code;
        this.data = error.data;
        this.method = method;
        this.requestId = requestId;
    }
}
export class AgencMalformedResponseError extends Error {
    response;
    constructor(message, response) {
        super(message);
        this.name = "AgencMalformedResponseError";
        this.response = response;
    }
}
export class AgencPromptRunInProgressError extends Error {
    sessionId;
    clientMessageId;
    constructor(sessionId, clientMessageId) {
        super(`A prompt run is already active for session ${sessionId}`);
        this.name = "AgencPromptRunInProgressError";
        this.sessionId = sessionId;
        this.clientMessageId = clientMessageId;
    }
}
export class AgencDuplicateSubmissionIncompleteError extends Error {
    sessionId;
    clientMessageId;
    constructor(sessionId, clientMessageId) {
        super(`The prior submission ${clientMessageId} has no durable terminal outcome`);
        this.name = "AgencDuplicateSubmissionIncompleteError";
        this.sessionId = sessionId;
        this.clientMessageId = clientMessageId;
    }
}
export class AgencCapabilityUnavailableError extends Error {
    capability;
    negotiatedProtocolVersion;
    constructor(capability, negotiatedProtocolVersion) {
        super(`${capability} is unavailable with negotiated daemon protocol ${negotiatedProtocolVersion ?? "unknown"}`);
        this.name = "AgencCapabilityUnavailableError";
        this.capability = capability;
        if (negotiatedProtocolVersion !== undefined) {
            this.negotiatedProtocolVersion = negotiatedProtocolVersion;
        }
    }
}
/** A durable replay cursor cannot be advanced without acknowledging a gap. */
export class AgencRunReplayGapError extends Error {
    runId;
    cursor;
    gap;
    constructor(cursor, gap) {
        const firstAvailable = "firstAvailableSequence" in gap
            ? `; first available sequence is ${String(gap.firstAvailableSequence)}`
            : "lastAvailableSequence" in gap
                ? `; last available sequence is ${String(gap.lastAvailableSequence)}`
                : "";
        super(`AgenC run replay for ${cursor.runId} has an explicit ${gap.reason} gap after sequence ${String(cursor.afterSequence)}${firstAvailable}`);
        this.name = "AgencRunReplayGapError";
        this.runId = cursor.runId;
        this.cursor = cursor;
        this.gap = gap;
    }
}
/** The daemon returned a replay page that could hide loss or corruption. */
export class AgencRunReplayProtocolError extends Error {
    runId;
    cursor;
    response;
    constructor(message, cursor, response) {
        super(message);
        this.name = "AgencRunReplayProtocolError";
        this.runId = cursor.runId;
        this.cursor = cursor;
        this.response = response;
    }
}
/** Cap on internally buffered, not-yet-consumed prompt events. */
const MAX_BUFFERED_PROMPT_EVENTS = 1_000;
function createEventChannel() {
    const buffered = [];
    let done = false;
    let finalResult = null;
    let failure = null;
    let wake = null;
    let resolveResult;
    let rejectResult;
    const result = new Promise((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
    });
    // A prompt run that is only awaited via `.result()` never iterates, so a
    // rejected result promise would otherwise surface as an unhandled
    // rejection even though `iterate()` reports the same failure. Attach a
    // no-op handler; `.result()` callers still observe the rejection.
    result.catch(() => { });
    const notify = () => {
        wake?.();
        wake = null;
    };
    return {
        push(event) {
            if (done)
                return;
            buffered.push(event);
            while (buffered.length > MAX_BUFFERED_PROMPT_EVENTS)
                buffered.shift();
            notify();
        },
        end(value) {
            if (done)
                return;
            done = true;
            finalResult = value;
            resolveResult(value);
            notify();
        },
        fail(error) {
            if (done)
                return;
            done = true;
            failure = error;
            rejectResult(error);
            notify();
        },
        result,
        async *iterate() {
            for (;;) {
                while (buffered.length > 0) {
                    yield buffered.shift();
                }
                if (done) {
                    if (failure !== null)
                        throw failure;
                    return finalResult;
                }
                await new Promise((resolve) => {
                    wake = resolve;
                });
            }
        },
    };
}
export class AgencSession {
    sessionId;
    agentId;
    #client;
    constructor(client, sessionId, agentId) {
        this.#client = client;
        this.sessionId = sessionId;
        this.agentId = agentId;
    }
    /** Send one message and stream the turn's events. */
    prompt(content, options = {}) {
        return this.#client.runPrompt(this.sessionId, content, options);
    }
    transcript() {
        return this.#client.request("session.transcript", {
            sessionId: this.sessionId,
        });
    }
    transcriptV2() {
        return this.#client.request("session.transcript.v2", {
            sessionId: this.sessionId,
        });
    }
    snapshot() {
        return this.#client.request("session.snapshot", {
            sessionId: this.sessionId,
        });
    }
    async cancelTurn(reason, expectedTurnId) {
        await this.#client.request("session.cancelTurn", {
            sessionId: this.sessionId,
            ...(reason !== undefined ? { reason } : {}),
            ...(expectedTurnId !== undefined ? { expectedTurnId } : {}),
        });
    }
    async terminate(reason) {
        await this.#client.request("session.terminate", {
            sessionId: this.sessionId,
            ...(reason !== undefined ? { reason } : {}),
        });
    }
}
const DEFAULT_REPLAY_IDENTITY_WINDOW = 1_024;
const MAX_REPLAY_IDENTITY_WINDOW = 100_000;
const REPLAY_IDENTITY_FILTER_BYTES = 64 * 1_024;
/**
 * Fixed-memory membership filter for identities that age out of the exact
 * fingerprint window. It has no false negatives because bits are never
 * cleared. A hash collision can only reject a new identity (fail closed);
 * it can never let an old identity be reused as new.
 */
class SeenReplayIdentityFilter {
    #bits = new Uint8Array(REPLAY_IDENTITY_FILTER_BYTES);
    add(value) {
        for (const bit of replayIdentityHashBits(value)) {
            this.#bits[bit >>> 3] |= 1 << (bit & 7);
        }
    }
    has(value) {
        for (const bit of replayIdentityHashBits(value)) {
            if ((this.#bits[bit >>> 3] & (1 << (bit & 7))) === 0)
                return false;
        }
        return true;
    }
}
class ClientRunAttachment {
    runId;
    #client;
    #limit;
    #identityWindow;
    #signal;
    #onDuplicate;
    #seenBySequence = new Map();
    #seenByEventId = new Map();
    #seenOrder = new Set();
    #seenEventIds = new SeenReplayIdentityFilter();
    #afterSequence;
    #duplicatesDropped = 0;
    #replaying = false;
    constructor(client, options) {
        this.#client = client;
        this.runId = normalizeReplayRunId(options.runId);
        this.#afterSequence = normalizeReplayAfterSequence(options.afterSequence);
        this.#limit = normalizeReplayLimit(options.limit);
        this.#identityWindow = normalizeReplayIdentityWindow(options.identityWindow);
        this.#signal = options.signal;
        this.#onDuplicate = options.onDuplicate;
    }
    cursor() {
        return { runId: this.runId, afterSequence: this.#afterSequence };
    }
    diagnostics() {
        return {
            duplicatesDropped: this.#duplicatesDropped,
            trackedIdentities: this.#seenOrder.size,
            identityWindow: this.#identityWindow,
        };
    }
    async #fetchPage() {
        const requestedAfterSequence = this.#afterSequence;
        const requestedCursor = this.cursor();
        this.#signal?.throwIfAborted();
        const response = await this.#client.replayRun({
            runId: this.runId,
            afterSequence: requestedAfterSequence,
            limit: this.#limit,
        });
        this.#signal?.throwIfAborted();
        validateReplayPageEnvelope(response, requestedCursor, this.#limit);
        if (response.gap === null &&
            response.source.sequenceScope === "run" &&
            response.firstAvailableSequence !== undefined &&
            response.firstAvailableSequence > requestedAfterSequence + 1) {
            throw new AgencRunReplayProtocolError(`AgenC run replay exposed first available sequence ${String(response.firstAvailableSequence)} without an explicit gap`, requestedCursor, response);
        }
        const uniqueEvents = [];
        const pageBySequence = new Map();
        const pageByEventId = new Map();
        let previousNewSequence = requestedAfterSequence;
        for (const event of response.events) {
            validateReplayEvent(event, requestedCursor, response);
            const fingerprint = canonicalJson(event);
            const bySequence = pageBySequence.get(event.sequence) ??
                this.#seenBySequence.get(event.sequence);
            const byEventId = pageByEventId.get(event.eventId) ??
                this.#seenByEventId.get(event.eventId);
            if (bySequence !== undefined || byEventId !== undefined) {
                const original = bySequence ?? byEventId;
                if (original.event.sequence !== event.sequence ||
                    original.event.eventId !== event.eventId ||
                    original.fingerprint !== fingerprint) {
                    throw new AgencRunReplayProtocolError(`AgenC run replay reused event identity ${event.eventId}/${String(event.sequence)} with conflicting data`, requestedCursor, response);
                }
                this.#reportDuplicate({
                    event,
                    reason: "same_identity",
                    original: original.event,
                });
                continue;
            }
            if (event.sequence <= requestedAfterSequence) {
                throw new AgencRunReplayProtocolError("AgenC run replay cannot verify event " +
                    event.eventId +
                    "/" +
                    String(event.sequence) +
                    " at or before exclusive cursor " +
                    String(requestedAfterSequence), requestedCursor, response);
            }
            if (this.#seenEventIds.has(event.eventId)) {
                throw new AgencRunReplayProtocolError("AgenC run replay reused event identity " +
                    event.eventId +
                    " outside the exact verification window", requestedCursor, response);
            }
            if (event.sequence <= previousNewSequence) {
                throw new AgencRunReplayProtocolError(`AgenC run replay events are not strictly sequence ordered after ${String(previousNewSequence)}`, requestedCursor, response);
            }
            if (response.source.sequenceScope === "run" &&
                event.sequence !== previousNewSequence + 1) {
                throw new AgencRunReplayProtocolError(`AgenC run replay skipped sequence ${String(previousNewSequence + 1)} without an explicit gap`, requestedCursor, response);
            }
            const seen = { event, fingerprint };
            pageBySequence.set(event.sequence, seen);
            pageByEventId.set(event.eventId, seen);
            uniqueEvents.push(seen);
            previousNewSequence = event.sequence;
        }
        const expectedNextAfterSequence = uniqueEvents.at(-1)?.event.sequence ?? requestedAfterSequence;
        if (response.nextAfterSequence !== expectedNextAfterSequence) {
            throw new AgencRunReplayProtocolError(`AgenC run replay attempted to advance from ${String(requestedAfterSequence)} to ${String(response.nextAfterSequence)} without a matching final event`, requestedCursor, response);
        }
        if (response.gap === null &&
            response.hasMore &&
            expectedNextAfterSequence === requestedAfterSequence) {
            throw new AgencRunReplayProtocolError("AgenC run replay reported more events without advancing its cursor", requestedCursor, response);
        }
        if (response.gap === null &&
            response.lastAvailableSequence !== undefined &&
            ((response.hasMore &&
                expectedNextAfterSequence >= response.lastAvailableSequence) ||
                (!response.hasMore &&
                    expectedNextAfterSequence !== response.lastAvailableSequence))) {
            throw new AgencRunReplayProtocolError(response.hasMore
                ? "AgenC run replay reported more events at or beyond its advertised journal tail"
                : `AgenC run replay ended at sequence ${String(expectedNextAfterSequence)} before its advertised journal tail ${String(response.lastAvailableSequence)}`, requestedCursor, response);
        }
        if (response.gap !== null) {
            validateReplayGap(response.gap, { runId: this.runId, afterSequence: expectedNextAfterSequence }, response);
        }
        return {
            events: uniqueEvents,
            hasMore: response.hasMore,
            gap: response.gap,
        };
    }
    async *replay() {
        if (this.#replaying) {
            throw new AgencRunReplayProtocolError("AgenC run replay does not allow concurrent cursor advancement", this.cursor());
        }
        this.#replaying = true;
        try {
            for (;;) {
                const page = await this.#fetchPage();
                for (const seen of page.events) {
                    this.#signal?.throwIfAborted();
                    this.#remember(seen);
                    this.#afterSequence = seen.event.sequence;
                    yield seen.event;
                }
                if (page.gap !== null) {
                    throw new AgencRunReplayGapError(this.cursor(), page.gap);
                }
                if (!page.hasMore)
                    return;
            }
        }
        finally {
            this.#replaying = false;
        }
    }
    [Symbol.asyncIterator]() {
        return this.replay();
    }
    result() {
        return this.#client.runResult(this.runId);
    }
    #reportDuplicate(duplicate) {
        this.#duplicatesDropped += 1;
        try {
            this.#onDuplicate?.(duplicate);
        }
        catch {
            // Observability callbacks cannot make safe duplicate suppression fail.
        }
    }
    #remember(seen) {
        this.#seenBySequence.set(seen.event.sequence, seen);
        this.#seenByEventId.set(seen.event.eventId, seen);
        this.#seenEventIds.add(seen.event.eventId);
        this.#seenOrder.add(seen);
        while (this.#seenOrder.size > this.#identityWindow) {
            const retired = this.#seenOrder.values().next().value;
            if (retired === undefined)
                break;
            this.#seenOrder.delete(retired);
            if (this.#seenBySequence.get(retired.event.sequence) === retired) {
                this.#seenBySequence.delete(retired.event.sequence);
            }
            if (this.#seenByEventId.get(retired.event.eventId) === retired) {
                this.#seenByEventId.delete(retired.event.eventId);
            }
        }
    }
}
export class AgencClient {
    #transport;
    #createRequestId;
    #clientId;
    #clientName;
    #onPermissionRequest;
    #onElicitationRequest;
    #notificationListeners = new Set();
    #sessionListeners = new Map();
    #attachedSessionIds = new Set();
    #activePromptRuns = new Map();
    #initializeResult;
    #negotiatedClientProtocolVersion;
    #initialized = false;
    #closed = false;
    constructor(options) {
        this.#transport = options.transport;
        this.#createRequestId = options.createRequestId ?? numericIdFactory();
        this.#clientId =
            options.clientId ?? `agenc-sdk-${process.pid}-${randomUUID()}`;
        this.#clientName = options.clientName ?? "agenc-sdk";
        this.#onPermissionRequest = options.onPermissionRequest;
        this.#onElicitationRequest = options.onElicitationRequest;
    }
    get clientId() {
        return this.#clientId;
    }
    get initialized() {
        return this.#initialized;
    }
    get negotiatedProtocolVersion() {
        return this.#negotiatedClientProtocolVersion;
    }
    get serverProtocolVersion() {
        return this.#initializeResult?.protocol.version;
    }
    get serverCapabilities() {
        return this.#initializeResult?.capabilities;
    }
    #supportsMethod(method) {
        const methods = this.#initializeResult?.capabilities["daemon.methods"];
        return isJsonObject(methods) && methods[method] === true;
    }
    /**
     * Feed a server-to-client notification into the client. Socket transports
     * call this automatically; in-process embedders wire it as the runtime
     * transport's `sendNotification` callback.
     */
    dispatchNotification(message) {
        for (const listener of this.#notificationListeners) {
            safeNotify(listener, message);
        }
        const sessionId = sessionIdFromNotification(message);
        if (sessionId === null)
            return;
        const listeners = this.#sessionListeners.get(sessionId);
        if (listeners === undefined)
            return;
        for (const listener of listeners) {
            safeNotify(listener, message);
        }
    }
    /** Subscribe to every raw daemon notification. */
    onNotification(listener) {
        this.#notificationListeners.add(listener);
        return () => {
            this.#notificationListeners.delete(listener);
        };
    }
    /** Subscribe to raw notifications for one session. */
    onSessionNotification(sessionId, listener) {
        let listeners = this.#sessionListeners.get(sessionId);
        if (listeners === undefined) {
            listeners = new Set();
            this.#sessionListeners.set(sessionId, listeners);
        }
        listeners.add(listener);
        return () => {
            const current = this.#sessionListeners.get(sessionId);
            current?.delete(listener);
            if (current?.size === 0)
                this.#sessionListeners.delete(sessionId);
        };
    }
    async request(method, params) {
        if (this.#closed)
            throw new Error("AgenC SDK client is closed");
        const id = this.#createRequestId();
        const request = params === undefined
            ? { jsonrpc: AGENC_SDK_JSON_RPC_VERSION, id, method }
            : { jsonrpc: AGENC_SDK_JSON_RPC_VERSION, id, method, params };
        const response = await this.#transport.request(request);
        return parseResponse(response, method, id);
    }
    async initialize(params = {}) {
        const explicitVersion = params.protocol?.version !== undefined ||
            params.protocolVersion !== undefined;
        let requestedVersion = params.protocol?.version ??
            params.protocolVersion ??
            AGENC_SDK_DAEMON_PROTOCOL_VERSION;
        const request = {
            clientName: this.#clientName,
            capabilities: {},
            ...params,
            protocolVersion: requestedVersion,
            protocol: { version: requestedVersion },
        };
        let result;
        try {
            result = await this.request("initialize", request);
        }
        catch (error) {
            const fallbackVersion = explicitVersion
                ? undefined
                : compatibleServerVersionFromInitializeError(error);
            if (fallbackVersion === undefined)
                throw error;
            requestedVersion = fallbackVersion;
            result = await this.request("initialize", {
                ...request,
                protocolVersion: fallbackVersion,
                protocol: { version: fallbackVersion },
            });
        }
        this.#initialized = true;
        this.#initializeResult = result;
        this.#negotiatedClientProtocolVersion = effectiveNegotiatedVersion(requestedVersion, result.protocol.version);
        return result;
    }
    /**
     * Create a runnable daemon session and attach this client to it.
     * Prefer gateway-style `agent.create` first so `message.send` has a live
     * agent (todo-133). Falls back to bare `session.create` when `agentId` is
     * already supplied.
     */
    async createSession(params = {}) {
        const existingAgentId = typeof params.agentId === "string"
            ? String(params.agentId).trim()
            : "";
        // DAE-02: always send absolute client workspace cwd on the wire.
        const cwd = resolveClientCwd(typeof params.cwd === "string"
            ? String(params.cwd)
            : undefined);
        if (existingAgentId.length === 0) {
            const agent = await this.spawnAgent({
                objective: typeof params.objective === "string" &&
                    String(params.objective).trim().length > 0
                    ? String(params.objective).trim()
                    : "Interactive session",
                cwd,
                initialContent: [],
            });
            const attached = await this.attachAgent(agent.agentId);
            if (attached.session !== null) {
                return attached.session;
            }
        }
        const created = await this.request("session.create", {
            ...params,
            cwd,
        });
        await this.#attachSession(created.sessionId);
        return new AgencSession(this, created.sessionId, created.agentId);
    }
    /** Attach to an existing daemon-owned session by id. */
    async resumeSession(sessionId) {
        await this.#attachSession(sessionId);
        return new AgencSession(this, sessionId);
    }
    /** Spawn a long-lived background agent (`agent.create`). */
    spawnAgent(params) {
        return this.request("agent.create", {
            ...params,
            // DAE-02: client fills absolute cwd when callers omit it; daemon still
            // rejects empty/relative paths.
            cwd: resolveClientCwd(typeof params.cwd === "string" ? params.cwd : undefined),
        });
    }
    /**
     * Attach to a running background agent. Returns the raw attach result and
     * an {@link AgencSession} bound to the agent's first active session (or
     * `null` when the agent has none).
     */
    async attachAgent(agentId) {
        const attach = await this.request("agent.attach", {
            agentId,
            clientId: this.#clientId,
        });
        const sessionId = attach.sessionIds[0];
        if (sessionId === undefined)
            return { attach, session: null };
        this.#attachedSessionIds.add(sessionId);
        return { attach, session: new AgencSession(this, sessionId, agentId) };
    }
    listAgents(params = {}) {
        return this.request("agent.list", params);
    }
    stopAgent(agentId, reason) {
        return this.request("agent.stop", {
            agentId,
            ...(reason !== undefined ? { reason } : {}),
        });
    }
    agentLogs(agentId) {
        return this.request("agent.logs", { agentId });
    }
    /** Read durable run state and its aggregate M3 admission state. */
    runStatus(runId) {
        return this.request("run.status", { runId });
    }
    /** Read a terminal outcome. Nonterminal runs reject with RUN_NOT_TERMINAL. */
    runResult(runId) {
        return this.request("run.result", { runId });
    }
    /** Replay a bounded page of the canonical run journal. */
    replayRun(params) {
        return this.request("run.replay", params);
    }
    /**
     * Reattach to a durable run from an exclusive cursor.
     *
     * The returned attachment preserves event identity, suppresses harmless
     * duplicate delivery, refuses silent cursor jumps, and exposes a durable
     * `run.result` read that does not depend on the original connection.
     */
    reattachRun(options) {
        return new ClientRunAttachment(this, options);
    }
    /** Export a bounded, hashed canonical run-journal evidence page. */
    runEvidence(params) {
        return this.request("run.evidence", params);
    }
    /** Tree-scoped durable run cancellation. */
    cancelRun(runId, reason) {
        return this.request("run.cancel", {
            runId,
            ...(reason !== undefined ? { reason } : {}),
        });
    }
    /**
     * Start the M5 verified-change workflow as a durable daemon run. Resolves
     * after the intake commit; follow the pipeline with the existing
     * status/replay/result/evidence cursor contract on the returned run id.
     */
    startRun(params) {
        return this.request("run.start", params);
    }
    /** List a bounded page of CSV unknown-outcome reviews. */
    listCsvJobReviews(params) {
        return this.request("csvJob.review.list", {
            ...params,
            cwd: resolveClientCwd(params.cwd),
        });
    }
    /** Read one bounded CSV review record. */
    showCsvJobReview(params) {
        return this.request("csvJob.review.show", {
            ...params,
            cwd: resolveClientCwd(params.cwd),
        });
    }
    /** Resolve a CSV unknown outcome with canonical operator evidence. */
    resolveCsvJobReview(params) {
        return this.request("csvJob.review.resolve", {
            ...params,
            cwd: resolveClientCwd(params.cwd),
        });
    }
    /**
     * Internal engine behind {@link AgencSession.prompt}. Exposed on the
     * client so sessions stay thin data holders.
     */
    runPrompt(sessionId, content, options = {}) {
        const clientMessageId = normalizeClientMessageId(options.clientMessageId);
        const existingRun = this.#activePromptRuns.get(sessionId);
        if (existingRun !== undefined) {
            throw new AgencPromptRunInProgressError(sessionId, existingRun.clientMessageId);
        }
        const reservation = {
            clientMessageId,
        };
        this.#activePromptRuns.set(sessionId, reservation);
        const releaseReservation = () => {
            if (this.#activePromptRuns.get(sessionId) === reservation) {
                this.#activePromptRuns.delete(sessionId);
            }
        };
        const channel = createEventChannel();
        const onPermissionRequest = options.onPermissionRequest ?? this.#onPermissionRequest;
        const onElicitationRequest = options.onElicitationRequest ?? this.#onElicitationRequest;
        const deniedPermissionRequestIds = new Set();
        const handledPermissionRequestIds = new Set();
        let assistantOutput = "";
        let lastCommittedMessage = "";
        let finishing = false;
        let submissionDispatched = false;
        let submissionObserved = false;
        let cancelBeforeDispatchReason;
        let deferredCancellationReason;
        let cancellationPromise;
        let removeAbortListener = () => { };
        const flushDeferredCancellation = () => {
            if (cancellationPromise !== undefined ||
                deferredCancellationReason === undefined ||
                !submissionObserved ||
                reservation.turnId === undefined) {
                return cancellationPromise ?? Promise.resolve();
            }
            cancellationPromise = this.request("session.cancelTurn", {
                sessionId,
                reason: deferredCancellationReason,
                ...(this.#supportsMethod("session.transcript.v2")
                    ? { expectedTurnId: reservation.turnId }
                    : {}),
            }).then(() => { });
            return cancellationPromise;
        };
        const requestScopedCancellation = (reason) => {
            if (!submissionDispatched) {
                cancelBeforeDispatchReason = reason;
                return Promise.resolve();
            }
            if (!this.#supportsMethod("session.transcript.v2")) {
                // A legacy session-wide cancel can race with the next turn after the
                // observed turn completes. Never claim scoped cancellation when the
                // daemon cannot atomically compare expectedTurnId.
                return Promise.reject(new AgencCapabilityUnavailableError("turn-scoped prompt cancellation", this.#negotiatedClientProtocolVersion));
            }
            deferredCancellationReason = reason;
            return flushDeferredCancellation();
        };
        const finish = async (status) => {
            if (finishing)
                return;
            finishing = true;
            unsubscribe();
            removeAbortListener();
            releaseReservation();
            let usageFields = {};
            if (options.includeUsage !== false) {
                try {
                    const snapshot = await this.request("session.snapshot", {
                        sessionId,
                    });
                    usageFields = {
                        usage: snapshot.tokenUsage,
                        cacheStats: snapshot.cacheStats,
                    };
                }
                catch {
                    /* usage is best-effort */
                }
            }
            channel.end({
                stopReason: stopReasonFromExitCode(status.code),
                exitCode: status.code,
                finalMessage: status.message ?? (lastCommittedMessage || assistantOutput.trimEnd()),
                deniedPermissionRequestIds: [...deniedPermissionRequestIds],
                ...usageFields,
            });
        };
        const respondToPermission = async (event) => {
            if (handledPermissionRequestIds.has(event.requestId))
                return;
            handledPermissionRequestIds.add(event.requestId);
            // Mirror `agenc -p`: an unanswered permission request suspends the turn
            // forever, so without a handler the SDK denies (never grants).
            let decision = {
                behavior: "deny",
                reason: "agenc-sdk: no permission handler registered",
            };
            if (onPermissionRequest !== undefined) {
                try {
                    decision = await onPermissionRequest({ ...event, sessionId });
                }
                catch {
                    decision = {
                        behavior: "deny",
                        reason: "agenc-sdk: permission handler threw",
                    };
                }
            }
            try {
                if (decision.behavior === "allow") {
                    await this.request("tool.approve", {
                        sessionId,
                        requestId: event.requestId,
                        ...(decision.scope !== undefined ? { scope: decision.scope } : {}),
                    });
                }
                else {
                    deniedPermissionRequestIds.add(event.requestId);
                    await this.request("tool.deny", {
                        sessionId,
                        requestId: event.requestId,
                        ...(decision.reason !== undefined
                            ? { reason: decision.reason }
                            : {}),
                    });
                }
            }
            catch {
                /* stale/already-resolved requests are harmless */
            }
        };
        const respondToElicitation = async (event) => {
            if (onElicitationRequest === undefined)
                return;
            let response = null;
            try {
                response = await onElicitationRequest({ ...event, sessionId });
            }
            catch {
                return;
            }
            if (response === null)
                return;
            try {
                await this.request("elicitation.respond", {
                    sessionId,
                    requestId: event.requestId,
                    kind: event.kind,
                    ...(event.serverName !== undefined
                        ? { serverName: event.serverName }
                        : {}),
                    response,
                });
            }
            catch {
                /* stale/already-resolved requests are harmless */
            }
        };
        const unsubscribe = this.onSessionNotification(sessionId, (message) => {
            const observedClientMessageId = userMessageClientMessageIdFromNotification(message);
            if (!submissionObserved) {
                if (observedClientMessageId !== clientMessageId)
                    return;
                submissionObserved = true;
            }
            else if (observedClientMessageId !== null &&
                observedClientMessageId !== clientMessageId) {
                return;
            }
            const event = promptEventFromNotification(message);
            if (event?.clientMessageId !== undefined &&
                event.clientMessageId !== clientMessageId) {
                return;
            }
            const startedTurnId = turnStartedIdFromNotification(message);
            if (startedTurnId !== null) {
                if (reservation.turnId !== undefined &&
                    reservation.turnId !== startedTurnId) {
                    return;
                }
                reservation.turnId = startedTurnId;
                void flushDeferredCancellation().catch(() => { });
            }
            if (reservation.turnId === undefined &&
                observedClientMessageId === null) {
                return;
            }
            const notificationTurnId = event?.turnId ?? turnIdFromNotification(message);
            if (reservation.turnId !== undefined &&
                notificationTurnId !== null &&
                notificationTurnId !== undefined &&
                notificationTurnId !== reservation.turnId) {
                return;
            }
            if (event !== null) {
                if (event.type === "text")
                    assistantOutput += event.delta;
                if (event.type === "message_committed") {
                    lastCommittedMessage = event.text;
                }
                channel.push(event);
                if (event.type === "permission_request")
                    void respondToPermission(event);
                if (event.type === "elicitation_request") {
                    void respondToElicitation(event);
                }
            }
            const terminal = terminalStatusFromNotification(message);
            if (terminal !== null)
                void finish(terminal);
        });
        if (options.signal !== undefined) {
            const signal = options.signal;
            const onAbort = () => {
                void requestScopedCancellation(String(signal.reason ?? "aborted")).catch(() => { });
            };
            if (signal.aborted)
                onAbort();
            else {
                signal.addEventListener("abort", onAbort, { once: true });
                removeAbortListener = () => signal.removeEventListener("abort", onAbort);
            }
        }
        const accepted = (async () => {
            throwIfPromptCancelledBeforeDispatch(cancelBeforeDispatchReason);
            if (options.ifBusy !== undefined &&
                !this.#supportsMethod("session.transcript.v2")) {
                throw new AgencCapabilityUnavailableError('ifBusy: "reject" prompt admission', this.#negotiatedClientProtocolVersion);
            }
            await this.#attachSession(sessionId);
            throwIfPromptCancelledBeforeDispatch(cancelBeforeDispatchReason);
            submissionDispatched = true;
            const sendResult = await this.request("message.send", {
                sessionId,
                content,
                clientMessageId,
                ...(options.ifBusy !== undefined ? { ifBusy: options.ifBusy } : {}),
                ...(options.metadata !== undefined
                    ? { metadata: options.metadata }
                    : {}),
            });
            if (sendResult.turnId !== undefined) {
                reservation.turnId = sendResult.turnId;
                void flushDeferredCancellation().catch(() => { });
            }
            if (sendResult.disposition === "duplicate" && !finishing) {
                if (sendResult.duplicateState !== "completed") {
                    throw new AgencDuplicateSubmissionIncompleteError(sessionId, clientMessageId);
                }
                try {
                    const snapshot = await this.request("session.transcript.v2", {
                        sessionId,
                    });
                    const finalAssistant = [...snapshot.messages]
                        .reverse()
                        .find((entry) => entry.clientMessageId === clientMessageId &&
                        entry.role === "assistant");
                    if (finalAssistant !== undefined) {
                        lastCommittedMessage = finalAssistant.text;
                    }
                }
                catch {
                    /* a legacy daemon cannot provide identity-bearing reconciliation */
                }
                void finish({
                    code: sendResult.terminal?.code ?? 0,
                    ...(sendResult.terminal?.message !== undefined
                        ? { message: sendResult.terminal.message }
                        : lastCommittedMessage.length > 0
                            ? { message: lastCommittedMessage }
                            : {}),
                });
            }
            else if (sendResult.terminal !== undefined && !finishing) {
                // The RPC result is the authoritative terminal fallback when a live
                // notification was lost or filtered during reconnect. Legacy daemons
                // omit this field, so their behavior remains notification-driven.
                void finish(sendResult.terminal);
            }
            return {
                messageId: sendResult.messageId,
                clientMessageId,
                ...(sendResult.turnId !== undefined
                    ? { turnId: sendResult.turnId }
                    : {}),
            };
        })();
        accepted.catch((error) => {
            unsubscribe();
            removeAbortListener();
            releaseReservation();
            channel.fail(error instanceof Error ? error : new Error(String(error)));
        });
        return {
            sessionId,
            accepted,
            result: () => channel.result,
            cancel: async (reason) => {
                await requestScopedCancellation(reason ?? "cancelled");
            },
            [Symbol.asyncIterator]: () => channel.iterate(),
        };
    }
    async close() {
        if (this.#closed)
            return;
        this.#closed = true;
        this.#notificationListeners.clear();
        this.#sessionListeners.clear();
        this.#activePromptRuns.clear();
        await this.#transport.close?.();
    }
    async #attachSession(sessionId) {
        if (this.#attachedSessionIds.has(sessionId))
            return;
        await this.request("session.attach", {
            sessionId,
            clientId: this.#clientId,
        });
        this.#attachedSessionIds.add(sessionId);
    }
}
export function createAgencClient(options) {
    return new AgencClient(options);
}
function numericIdFactory() {
    let nextId = 1;
    return () => {
        const id = nextId;
        nextId += 1;
        return id;
    };
}
function safeNotify(listener, message) {
    try {
        listener(message);
    }
    catch {
        // Listener failures must not poison notification routing.
    }
}
function nestedSessionEventFromNotification(message) {
    const params = isJsonObject(message.params) ? message.params : message;
    if (isJsonObject(params.event))
        return params.event;
    if (isJsonObject(params.msg))
        return params.msg;
    return null;
}
function userMessageClientMessageIdFromNotification(message) {
    const event = nestedSessionEventFromNotification(message);
    if (event?.type !== "user_message" || !isJsonObject(event.payload)) {
        return null;
    }
    if (typeof event.payload.messageId === "string") {
        return event.payload.messageId;
    }
    return typeof event.messageId === "string" ? event.messageId : null;
}
function turnStartedIdFromNotification(message) {
    const params = isJsonObject(message.params) ? message.params : message;
    if (message.method === "event.agent_status" &&
        typeof params.turnId === "string" &&
        (params.status === "running" || params.runStatus === "running")) {
        return params.turnId;
    }
    const event = nestedSessionEventFromNotification(message);
    if (event?.type !== "turn_started" || !isJsonObject(event.payload)) {
        return null;
    }
    return typeof event.payload.turnId === "string" ? event.payload.turnId : null;
}
function turnIdFromNotification(message) {
    const params = isJsonObject(message.params) ? message.params : message;
    if (typeof params.turnId === "string")
        return params.turnId;
    const event = nestedSessionEventFromNotification(message);
    if (event === null)
        return null;
    if (typeof event.turnId === "string")
        return event.turnId;
    return isJsonObject(event.payload) && typeof event.payload.turnId === "string"
        ? event.payload.turnId
        : null;
}
function throwIfPromptCancelledBeforeDispatch(reason) {
    if (reason === undefined)
        return;
    const error = new Error(`Prompt cancelled before dispatch: ${reason}`);
    error.name = "AbortError";
    throw error;
}
function effectiveNegotiatedVersion(requestedVersion, serverVersion) {
    const requested = /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(requestedVersion);
    const server = /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(serverVersion);
    if (requested === null || server === null || requested[1] !== server[1]) {
        return requestedVersion;
    }
    return Number.parseInt(requested[2], 10) <= Number.parseInt(server[2], 10)
        ? requestedVersion
        : serverVersion;
}
function compatibleServerVersionFromInitializeError(error) {
    if (!(error instanceof AgencRpcError) || !isJsonObject(error.data)) {
        return undefined;
    }
    if (error.data.code !== "PROTOCOL_VERSION_UNSUPPORTED")
        return undefined;
    const serverVersion = error.data.serverVersion;
    if (typeof serverVersion !== "string")
        return undefined;
    const match = /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(serverVersion);
    if (match === null)
        return undefined;
    const major = Number.parseInt(match[1], 10);
    const minor = Number.parseInt(match[2], 10);
    if (major !== 1 || minor < 0 || minor >= 2)
        return undefined;
    return serverVersion;
}
function parseResponse(response, method, requestId) {
    if (!isJsonObject(response)) {
        throw new AgencMalformedResponseError("AgenC daemon response must be an object", response);
    }
    if (response.jsonrpc !== AGENC_SDK_JSON_RPC_VERSION) {
        throw new AgencMalformedResponseError("AgenC daemon response used an unsupported JSON-RPC version", response);
    }
    if ("error" in response && isJsonObject(response.error)) {
        throw new AgencRpcError(response.error, method, response.id);
    }
    if (response.id !== requestId) {
        throw new AgencMalformedResponseError("AgenC daemon response id mismatch", response);
    }
    if (!("result" in response)) {
        throw new AgencMalformedResponseError("AgenC daemon response must include result or error", response);
    }
    return response.result;
}
/** Absolute workspace path for daemon create RPCs (DAE-02 client boundary). */
function resolveClientCwd(cwd) {
    const base = process.cwd();
    if (typeof cwd === "string" && cwd.trim().length > 0) {
        const trimmed = cwd.trim();
        return isAbsolute(trimmed) ? resolve(trimmed) : resolve(base, trimmed);
    }
    return resolve(base);
}
function normalizeClientMessageId(value) {
    if (value === undefined)
        return `message-${randomUUID()}`;
    const normalized = value.trim();
    if (normalized.length === 0) {
        throw new TypeError("clientMessageId must be a non-empty string");
    }
    return normalized;
}
function normalizeReplayRunId(runId) {
    const normalized = runId.trim();
    if (normalized.length === 0) {
        throw new TypeError("AgenC run replay requires a non-empty runId");
    }
    return normalized;
}
function normalizeReplayAfterSequence(afterSequence) {
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) {
        throw new TypeError("AgenC run replay afterSequence must be a non-negative safe integer");
    }
    return afterSequence;
}
function normalizeReplayLimit(limit) {
    const normalized = limit ?? 100;
    if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > 200) {
        throw new TypeError("AgenC run replay limit must be an integer from 1 to 200");
    }
    return normalized;
}
function normalizeReplayIdentityWindow(window) {
    const normalized = window ?? DEFAULT_REPLAY_IDENTITY_WINDOW;
    if (!Number.isSafeInteger(normalized) ||
        normalized < 1 ||
        normalized > MAX_REPLAY_IDENTITY_WINDOW) {
        throw new TypeError("AgenC run replay identityWindow must be an integer from 1 to " +
            String(MAX_REPLAY_IDENTITY_WINDOW));
    }
    return normalized;
}
function validateReplayPageEnvelope(response, cursor, requestedLimit) {
    if (!isJsonObject(response)) {
        throw new AgencRunReplayProtocolError("AgenC run replay response must be an object", cursor, response);
    }
    if (response.runId !== cursor.runId) {
        throw new AgencRunReplayProtocolError(`AgenC run replay returned run ${response.runId} for ${cursor.runId}`, cursor, response);
    }
    if (response.afterSequence !== cursor.afterSequence) {
        throw new AgencRunReplayProtocolError(`AgenC run replay returned cursor ${String(response.afterSequence)} for requested cursor ${String(cursor.afterSequence)}`, cursor, response);
    }
    if (response.limit !== requestedLimit) {
        throw new AgencRunReplayProtocolError(`AgenC run replay returned limit ${String(response.limit)} for requested limit ${String(requestedLimit)}`, cursor, response);
    }
    if (!Array.isArray(response.events)) {
        throw new AgencRunReplayProtocolError("AgenC run replay response events must be an array", cursor, response);
    }
    if (response.events.length > requestedLimit) {
        throw new AgencRunReplayProtocolError(`AgenC run replay returned ${String(response.events.length)} events for limit ${String(requestedLimit)}`, cursor, response);
    }
    const firstAvailableSequence = response.firstAvailableSequence;
    const lastAvailableSequence = response.lastAvailableSequence;
    if (firstAvailableSequence !== undefined &&
        (!Number.isSafeInteger(firstAvailableSequence) ||
            firstAvailableSequence < 1)) {
        throw new AgencRunReplayProtocolError("AgenC run replay returned an invalid firstAvailableSequence", cursor, response);
    }
    if (lastAvailableSequence !== undefined &&
        (!Number.isSafeInteger(lastAvailableSequence) || lastAvailableSequence < 0)) {
        throw new AgencRunReplayProtocolError("AgenC run replay returned an invalid lastAvailableSequence", cursor, response);
    }
    if (firstAvailableSequence !== undefined &&
        lastAvailableSequence !== undefined &&
        firstAvailableSequence > lastAvailableSequence &&
        (response.events.length > 0 ||
            firstAvailableSequence - lastAvailableSequence !== 1)) {
        throw new AgencRunReplayProtocolError("AgenC run replay returned inconsistent available-sequence bounds", cursor, response);
    }
    if (!Number.isSafeInteger(response.nextAfterSequence) ||
        response.nextAfterSequence < cursor.afterSequence) {
        throw new AgencRunReplayProtocolError("AgenC run replay returned an invalid nextAfterSequence", cursor, response);
    }
    if (typeof response.hasMore !== "boolean") {
        throw new AgencRunReplayProtocolError("AgenC run replay response hasMore must be boolean", cursor, response);
    }
    if (!isJsonObject(response.source)) {
        throw new AgencRunReplayProtocolError("AgenC run replay response source must be an object", cursor, response);
    }
    validateReplaySource(response, cursor);
    if (response.source.kind === "run_journal" &&
        response.source.available &&
        (response.events.length > 0 || cursor.afterSequence > 0) &&
        response.lastAvailableSequence === undefined) {
        throw new AgencRunReplayProtocolError("AgenC run replay omitted the canonical journal tail", cursor, response);
    }
    if (response.gap !== null && !isJsonObject(response.gap)) {
        throw new AgencRunReplayProtocolError("AgenC run replay response gap must be null or an object", cursor, response);
    }
}
function validateReplaySource(response, cursor) {
    const source = response.source;
    const invalid = (message) => {
        throw new AgencRunReplayProtocolError(message, cursor, response);
    };
    if (typeof source.available !== "boolean" ||
        typeof source.projectDir !== "string" ||
        source.projectDir.length === 0) {
        invalid("AgenC run replay returned malformed source metadata");
    }
    if (source.kind === "run_journal") {
        if (source.sequenceScope !== "run" ||
            source.canonical !== "rollout_jsonl" ||
            source.projection !== "thread_rollout_items") {
            invalid("AgenC run replay returned malformed run-journal source metadata");
        }
    }
    else if (source.kind === "execution_admission_journal") {
        if (source.sequenceScope !== "project_state_database" ||
            source.canonical !== undefined ||
            source.projection !== undefined) {
            invalid("AgenC run replay returned malformed admission-journal source metadata");
        }
    }
    else {
        invalid("AgenC run replay returned an unknown source kind");
    }
    const sourceUnavailable = response.gap?.kind === "source_unavailable";
    if (source.available === sourceUnavailable ||
        (!source.available && (response.events.length > 0 || response.hasMore))) {
        invalid("AgenC run replay source availability conflicts with its page");
    }
    if (sourceUnavailable &&
        ((source.kind === "run_journal" &&
            response.gap?.reason !== "run_journal_not_present") ||
            (source.kind === "execution_admission_journal" &&
                response.gap?.reason !== "execution_admission_journal_not_present"))) {
        invalid("AgenC run replay source kind conflicts with its unavailable reason");
    }
}
function validateReplayEvent(event, cursor, response) {
    const invalid = (message) => {
        throw new AgencRunReplayProtocolError(message, cursor, response);
    };
    const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
    if (!isJsonObject(event)) {
        invalid("AgenC run replay event must be an object");
    }
    if (!Number.isSafeInteger(event.sequence) ||
        event.sequence < 1 ||
        !isNonEmptyString(event.eventId)) {
        invalid("AgenC run replay event requires a positive sequence and non-empty eventId");
    }
    if (response.source.kind === "run_journal") {
        const canonicalCategories = new Set([
            "run",
            "step",
            "admission",
            "budget",
            "permission",
            "approval",
            "effect",
            "model",
            "artifact",
            "cancellation",
            "recovery",
            "terminal",
            "session",
        ]);
        if (!isNonEmptyString(event.runId) ||
            !isNonEmptyString(event.kind) ||
            !isNonEmptyString(event.event) ||
            !isNonEmptyString(event.category) ||
            !canonicalCategories.has(event.category) ||
            (event.timestamp !== undefined && !isNonEmptyString(event.timestamp)) ||
            (event.stepId !== undefined && !isNonEmptyString(event.stepId))) {
            invalid("AgenC run replay returned a malformed canonical event envelope");
        }
        if (event.runId !== cursor.runId) {
            invalid(`AgenC run replay event ${event.eventId} belongs to unexpected run ${event.runId}`);
        }
        return;
    }
    if (!isNonEmptyString(event.timestamp) ||
        !isNonEmptyString(event.runId) ||
        !isNonEmptyString(event.stepId) ||
        !isNonEmptyString(event.kind) ||
        !isNonEmptyString(event.event) ||
        (event.category !== undefined && event.category !== "admission")) {
        invalid("AgenC run replay returned a malformed admission event envelope");
    }
}
function validateReplayGap(gap, cursor, response) {
    if (gap.kind === "source_unavailable") {
        if (gap.reason !== "execution_admission_journal_not_present" &&
            gap.reason !== "run_journal_not_present") {
            throw new AgencRunReplayProtocolError("AgenC run replay returned an unknown source-unavailable reason", cursor, response);
        }
        return;
    }
    if (gap.kind === "cursor_ahead") {
        if (gap.runId !== cursor.runId ||
            gap.afterSequence !== cursor.afterSequence ||
            gap.reason !== "cursor_ahead" ||
            !Number.isSafeInteger(gap.lastAvailableSequence) ||
            gap.lastAvailableSequence < 0 ||
            gap.lastAvailableSequence >= gap.afterSequence ||
            response.lastAvailableSequence !== gap.lastAvailableSequence) {
            throw new AgencRunReplayProtocolError("AgenC run replay returned a malformed or mismatched cursor-ahead gap", cursor, response);
        }
        return;
    }
    if (gap.kind !== "event_gap" ||
        gap.runId !== cursor.runId ||
        gap.afterSequence !== cursor.afterSequence ||
        !Number.isSafeInteger(gap.firstAvailableSequence) ||
        gap.firstAvailableSequence <= gap.afterSequence ||
        (response.firstAvailableSequence !== undefined &&
            response.firstAvailableSequence !== gap.firstAvailableSequence) ||
        (gap.reason !== "retention" &&
            gap.reason !== "corruption_truncated" &&
            gap.reason !== "compaction")) {
        throw new AgencRunReplayProtocolError("AgenC run replay returned a malformed or mismatched event gap", cursor, response);
    }
}
function canonicalJson(value) {
    if (value === null)
        return "null";
    if (typeof value === "string")
        return JSON.stringify(value);
    if (typeof value === "number" || typeof value === "boolean") {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
    }
    if (isJsonObject(value)) {
        const fields = Object.keys(value)
            .filter((key) => value[key] !== undefined)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
        return `{${fields.join(",")}}`;
    }
    return JSON.stringify(String(value));
}
function replayIdentityHashBits(value) {
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        first = Math.imul(first ^ code, 0x01000193) >>> 0;
        second = Math.imul(second ^ (code + index), 0x85ebca6b) + 0xc2b2ae35;
        second >>>= 0;
    }
    const bitCount = REPLAY_IDENTITY_FILTER_BYTES * 8;
    return [
        first % bitCount,
        second % bitCount,
        (first + second) % bitCount,
        ((first + Math.imul(second, 3)) >>> 0) % bitCount,
    ];
}
//# sourceMappingURL=client.js.map