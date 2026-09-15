/**
 * Hand-mirrored subset of the AgenC daemon JSON-RPC protocol
 * (`runtime/src/app-server/protocol/index.ts`).
 *
 * This package deliberately does NOT import runtime internals; the shapes
 * here are a standalone mirror of the daemon's public control surface.
 * Drift is guarded by `runtime/tests/sdk-package/protocol-drift.contract.test.ts`,
 * which compares {@link AGENC_SDK_DAEMON_METHODS} and
 * {@link AGENC_SDK_DAEMON_NOTIFICATION_METHODS} against the runtime's
 * `AGENC_DAEMON_METHODS` / `AGENC_DAEMON_NOTIFICATION_METHODS` arrays,
 * so any protocol change fails tests until this mirror is updated.
 */
export const AGENC_SDK_JSON_RPC_VERSION = "2.0";
export const AGENC_SDK_DAEMON_PROTOCOL_VERSION = "1.2.0";
/**
 * Every public daemon request method, in the runtime's declaration order.
 * Mirror of `AGENC_DAEMON_METHODS` — see the module docblock for the drift
 * guard.
 */
export const AGENC_SDK_DAEMON_METHODS = [
    "initialize",
    "request.cancel",
    "agent.create",
    "agent.list",
    "agent.attach",
    "agent.stop",
    "agent.logs",
    "run.status",
    "run.result",
    "run.replay",
    "run.evidence",
    "run.cancel",
    "run.start",
    "csvJob.review.list",
    "csvJob.review.show",
    "csvJob.review.resolve",
    "session.create",
    "session.list",
    "session.attach",
    "session.detach",
    "session.terminate",
    "session.clear",
    "session.snapshot",
    "session.transcript",
    "session.transcript.v2",
    "session.cancelTurn",
    "session.resolveToolCall",
    "session.mcp.addServer",
    "message.send",
    "message.stream",
    "thread/realtime/start",
    "thread/realtime/appendAudio",
    "thread/realtime/appendText",
    "thread/realtime/stop",
    "thread/realtime/listVoices",
    "tool.approve",
    "tool.deny",
    "tool.cancel",
    "elicitation.respond",
    "permission.list",
    "fs.fuzzy_search",
    "commandExec.start",
    "commandExec.write",
    "commandExec.resize",
    "commandExec.terminate",
    "health.ping",
    "health.ready",
    "health.stats",
    "daemon.reload",
    "daemon.shutdown",
    "auth.login",
    "auth.whoami",
    "auth.logout",
];
/**
 * Every server-to-client notification method, in the runtime's declaration
 * order. Mirror of `AGENC_DAEMON_NOTIFICATION_METHODS`.
 */
export const AGENC_SDK_DAEMON_NOTIFICATION_METHODS = [
    "commandExec.outputDelta",
    "event.message_chunk",
    "event.tool_request",
    "event.permission_request",
    "event.user_input_request",
    "event.mcp_elicitation_request",
    "event.agent_status",
    "event.session_event",
    "event.event_gap",
    "thread/realtime/started",
    "thread/realtime/itemAdded",
    "thread/realtime/transcript/delta",
    "thread/realtime/transcript/done",
    "thread/realtime/outputAudio/delta",
    "thread/realtime/sdp",
    "thread/realtime/error",
    "thread/realtime/closed",
];
export function isRunAdmissionReplayResult(result) {
    return result.source.kind === "execution_admission_journal";
}
export function isRunJournalReplayResult(result) {
    return result.source.kind === "run_journal";
}
export function isJsonObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=protocol.js.map