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
import { isJsonObject } from "./protocol.js";
function eventParams(message) {
    return isJsonObject(message.params) ? message.params : message;
}
function nestedTranscriptEvent(message) {
    const params = eventParams(message);
    if (params === null)
        return null;
    if (isJsonObject(params.event))
        return params.event;
    if (isJsonObject(params.msg))
        return params.msg;
    return params;
}
/**
 * Extract streamed assistant text from a daemon notification. Mirrors the
 * CLI's `daemonOneShotMessageChunk`.
 */
export function messageChunkFromNotification(message) {
    const params = eventParams(message);
    if (message.method === "event.message_chunk" &&
        params !== null &&
        typeof params.delta === "string") {
        return params.delta;
    }
    const transcriptEvent = nestedTranscriptEvent(message);
    if (transcriptEvent === null)
        return null;
    const payload = isJsonObject(transcriptEvent.payload)
        ? transcriptEvent.payload
        : null;
    if (transcriptEvent.type === "agent_message_delta" &&
        payload !== null &&
        typeof payload.delta === "string") {
        return payload.delta;
    }
    return null;
}
/**
 * Detect the terminal status of a turn from a daemon notification. Mirrors
 * the CLI's `daemonOneShotFinalStatus`: `event.agent_status` with a terminal
 * run status, or a nested transcript `turn_complete`/`error` event.
 */
export function terminalStatusFromNotification(message) {
    const params = eventParams(message);
    if (message.method === "event.agent_status" && params !== null) {
        const runStatus = typeof params.runStatus === "string" ? params.runStatus : undefined;
        const status = typeof params.status === "string" ? params.status : undefined;
        const statusMessage = typeof params.message === "string" ? params.message : undefined;
        if (runStatus === "completed" || status === "idle") {
            return {
                code: 0,
                ...(statusMessage !== undefined ? { message: statusMessage } : {}),
            };
        }
        if (runStatus === "stopped" || status === "stopped") {
            return {
                code: 130,
                ...(statusMessage !== undefined ? { message: statusMessage } : {}),
            };
        }
        if (runStatus === "errored" || status === "error") {
            return {
                code: 1,
                ...(statusMessage !== undefined ? { message: statusMessage } : {}),
            };
        }
    }
    const transcriptEvent = nestedTranscriptEvent(message);
    if (transcriptEvent === null)
        return null;
    const payload = isJsonObject(transcriptEvent.payload)
        ? transcriptEvent.payload
        : null;
    if (transcriptEvent.type === "turn_complete") {
        const finalMessage = payload !== null && typeof payload.lastAgentMessage === "string"
            ? payload.lastAgentMessage
            : undefined;
        return {
            code: 0,
            ...(finalMessage !== undefined ? { message: finalMessage } : {}),
        };
    }
    if (transcriptEvent.type === "error") {
        const errorMessage = payload !== null && typeof payload.message === "string"
            ? payload.message
            : undefined;
        return {
            code: 1,
            ...(errorMessage !== undefined ? { message: errorMessage } : {}),
        };
    }
    return null;
}
export function stopReasonFromExitCode(code) {
    if (code === 0)
        return "completed";
    if (code === 130)
        return "stopped";
    return "errored";
}
/**
 * Map a raw daemon notification to a typed prompt event. Returns `null` for
 * notifications that carry no session-facing meaning (e.g. realtime audio).
 */
export function promptEventFromNotification(message) {
    const params = eventParams(message);
    const method = message.method;
    const identity = eventIdentityFromParams(params);
    if (method === "event.event_gap" && params !== null) {
        if (params.kind !== "event_gap" ||
            params.reason !== "retention" ||
            typeof params.sessionId !== "string" ||
            !Number.isSafeInteger(params.retiredCount) ||
            params.retiredCount < 1) {
            return null;
        }
        const afterSequence = positiveOrZeroInteger(params.afterSequence);
        const firstAvailableSequence = positiveInteger(params.firstAvailableSequence);
        return {
            type: "gap",
            kind: "event_gap",
            reason: "retention",
            ...identity,
            sessionId: params.sessionId,
            retiredCount: params.retiredCount,
            ...(typeof params.runId === "string" ? { runId: params.runId } : {}),
            ...(afterSequence !== undefined ? { afterSequence } : {}),
            ...(firstAvailableSequence !== undefined
                ? { firstAvailableSequence }
                : {}),
        };
    }
    if (method === "event.message_chunk" || method === "event.session_event") {
        const delta = messageChunkFromNotification(message);
        if (delta !== null && delta.length > 0) {
            const chunkParams = params ?? {};
            return {
                type: "text",
                delta,
                ...identity,
                ...(typeof chunkParams.streamId === "string"
                    ? { streamId: chunkParams.streamId }
                    : {}),
            };
        }
        if (method === "event.session_event" && params !== null) {
            const nested = nestedTranscriptEvent(message) ?? params;
            const payload = isJsonObject(nested.payload) ? nested.payload : null;
            if (nested.type === "agent_message" &&
                payload !== null &&
                typeof payload.message === "string") {
                return {
                    type: "message_committed",
                    text: payload.message,
                    ...identity,
                };
            }
            if (nested.type === "history_cleared") {
                return { type: "history_reset", reason: "cleared", ...identity };
            }
            if (nested.type === "transcript_epoch" &&
                payload !== null &&
                (payload.reason === "partial_compact" ||
                    payload.reason === "rewind" ||
                    payload.reason === "compaction_rollback")) {
                return {
                    type: "history_reset",
                    reason: payload.reason,
                    ...identity,
                };
            }
            return { type: "session_event", event: nested, ...identity };
        }
        return null;
    }
    if (params === null)
        return null;
    if (method === "event.tool_request") {
        if (typeof params.requestId !== "string")
            return null;
        return {
            type: "tool_call",
            requestId: params.requestId,
            toolName: typeof params.toolName === "string" ? params.toolName : "",
            ...identity,
            ...(typeof params.turnId === "string" ? { turnId: params.turnId } : {}),
            ...(params.input !== undefined ? { input: params.input } : {}),
            ...(typeof params.recoveryCategory === "string"
                ? { recoveryCategory: params.recoveryCategory }
                : {}),
        };
    }
    if (method === "event.permission_request") {
        if (typeof params.requestId !== "string" || params.requestId.length === 0) {
            return null;
        }
        const permissions = Array.isArray(params.permissions)
            ? params.permissions.filter((value) => typeof value === "string")
            : [];
        return {
            type: "permission_request",
            requestId: params.requestId,
            permissions,
            ...identity,
            ...(typeof params.toolName === "string"
                ? { toolName: params.toolName }
                : {}),
            ...(params.input !== undefined ? { input: params.input } : {}),
            ...(typeof params.reason === "string" ? { reason: params.reason } : {}),
        };
    }
    if (method === "event.user_input_request") {
        if (typeof params.requestId !== "string")
            return null;
        const questions = Array.isArray(params.questions)
            ? params.questions.filter(isJsonObject)
            : [];
        return {
            type: "elicitation_request",
            kind: "request_user_input",
            requestId: params.requestId,
            questions,
            ...identity,
            ...(isJsonObject(params.clientAction)
                ? { clientAction: params.clientAction }
                : {}),
        };
    }
    if (method === "event.mcp_elicitation_request") {
        const requestId = params.requestId;
        if (typeof requestId !== "string" && typeof requestId !== "number") {
            return null;
        }
        return {
            type: "elicitation_request",
            kind: "mcp",
            requestId,
            ...identity,
            ...(typeof params.serverName === "string"
                ? { serverName: params.serverName }
                : {}),
            ...(isJsonObject(params.request) ? { request: params.request } : {}),
        };
    }
    if (method === "event.agent_status") {
        return {
            type: "status",
            ...identity,
            ...(typeof params.status === "string" ? { status: params.status } : {}),
            ...(typeof params.runStatus === "string"
                ? { runStatus: params.runStatus }
                : {}),
            ...(typeof params.message === "string"
                ? { message: params.message }
                : {}),
        };
    }
    return null;
}
function eventIdentityFromParams(params) {
    if (params === null)
        return {};
    const sequence = params.sequence;
    const hasSequence = typeof sequence === "number" &&
        Number.isSafeInteger(sequence) &&
        sequence > 0;
    return {
        ...(typeof params.eventId === "string" ? { eventId: params.eventId } : {}),
        ...(hasSequence ? { sequence } : {}),
        ...(typeof params.runId === "string" ? { runId: params.runId } : {}),
        ...(typeof params.historyEpoch === "string"
            ? { historyEpoch: params.historyEpoch }
            : {}),
        ...(typeof params.turnId === "string" ? { turnId: params.turnId } : {}),
        ...(typeof params.clientMessageId === "string"
            ? { clientMessageId: params.clientMessageId }
            : {}),
        ...(typeof params.messageId === "string"
            ? { messageId: params.messageId }
            : {}),
    };
}
function positiveOrZeroInteger(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
        ? value
        : undefined;
}
function positiveInteger(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0
        ? value
        : undefined;
}
/** sessionId carried by a daemon notification, if any. */
export function sessionIdFromNotification(message) {
    if (typeof message.sessionId === "string")
        return message.sessionId;
    const params = message.params;
    if (isJsonObject(params) && typeof params.sessionId === "string") {
        return params.sessionId;
    }
    return null;
}
//# sourceMappingURL=events.js.map