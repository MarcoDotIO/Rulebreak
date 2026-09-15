/**
 * Local stream transport + `connect()` for the AgenC daemon.
 *
 * Wire contract (mirrors `runtime/src/app-server/transport/unix-socket.ts`
 * and the CLI client in `runtime/src/app-server/agent-cli.ts`):
 *   - Unix socket at `${AGENC_HOME:-~/.agenc}/daemon.sock`, or a stable
 *     per-home named pipe on Windows
 *   - newline-delimited JSON frames
 *   - the first message on a connection MUST be `initialize` carrying the
 *     `authCookie` read from `${AGENC_HOME:-~/.agenc}/daemon.cookie`
 *   - responses carry `id`; notifications carry `method` + `params` and no id
 *
 * Daemon autostart: the SDK cannot reuse the runtime's internal autostart
 * orchestration (build-skew detection, orphan adoption) without importing
 * runtime internals, so `connect()` implements attach-to-running plus
 * spawn-via-CLI: when the socket is not accepting connections it runs
 * `agenc daemon start` (configurable via `agencCommand`) and polls the
 * cookie + socket until ready. This is a documented deviation from the
 * launcher's in-process autostart path.
 */
import { type AgencDaemonMethod, type AgencDaemonRequest, type AgencDaemonResponse, type JsonObject } from "./protocol.js";
import { AgencClient, type AgencElicitationCallback, type AgencPermissionCallback, type AgencTransport } from "./client.js";
export declare function resolveAgencHome(env?: NodeJS.ProcessEnv, userHome?: string): string;
export declare function resolveDaemonSocketPath(env?: NodeJS.ProcessEnv, userHome?: string, platform?: NodeJS.Platform): string;
export declare function resolveDaemonCookiePath(env?: NodeJS.ProcessEnv, userHome?: string): string;
export interface AgencSocketTransportOptions {
    readonly socketPath: string;
    readonly connectTimeoutMs?: number;
    readonly requestTimeoutMs?: number;
    readonly onNotification?: (message: JsonObject) => void;
    readonly onClose?: (error: Error | null) => void;
}
/**
 * Persistent newline-JSON socket transport. Single connection, no reconnect
 * layer — embedders that need reconnect can recreate the client via
 * {@link connect}.
 */
export declare class AgencSocketTransport implements AgencTransport {
    #private;
    private constructor();
    static connect(options: AgencSocketTransportOptions): Promise<AgencSocketTransport>;
    request<Method extends AgencDaemonMethod>(request: AgencDaemonRequest<Method>): Promise<AgencDaemonResponse<Method>>;
    close(): Promise<void>;
}
export type AgencSpawnFn = (command: string, args: readonly string[], options: {
    readonly env: NodeJS.ProcessEnv;
    readonly stdio: "ignore";
}) => {
    once(event: "exit", listener: (code: number | null) => void): unknown;
    once(event: "error", listener: (error: Error) => void): unknown;
};
export interface AgencConnectOptions {
    readonly env?: NodeJS.ProcessEnv;
    readonly userHome?: string;
    readonly socketPath?: string;
    readonly cookiePath?: string;
    /** Start the daemon via the CLI when it is not running. Default `true`. */
    readonly autostart?: boolean;
    /**
     * Command used to start the daemon (`<cmd> daemon start`). Defaults to
     * `"agenc"` on PATH; pass an absolute launcher path when embedding.
     */
    readonly agencCommand?: string | readonly string[];
    /** Total budget for autostart + readiness polling. Default 45s or `AGENC_DAEMON_READY_TIMEOUT_MS`. */
    readonly readyTimeoutMs?: number;
    /**
     * Per-request timeout for bounded control RPCs. Default 30s or
     * `AGENC_DAEMON_REQUEST_TIMEOUT_MS`. Full-turn message RPCs are unbounded.
     */
    readonly requestTimeoutMs?: number;
    readonly clientId?: string;
    readonly clientName?: string;
    readonly onPermissionRequest?: AgencPermissionCallback;
    readonly onElicitationRequest?: AgencElicitationCallback;
    readonly onDisconnect?: (error: Error | null) => void;
    /** Injectable for tests. */
    readonly spawn?: AgencSpawnFn;
}
/**
 * Connect to the local AgenC daemon (starting it through the CLI when
 * needed), perform the `initialize` handshake, and return a ready client.
 */
export declare function connect(options?: AgencConnectOptions): Promise<AgencClient>;
//# sourceMappingURL=socket.d.ts.map