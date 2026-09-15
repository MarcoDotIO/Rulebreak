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
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, win32 } from "node:path";
import { createConnection } from "node:net";
import { spawn as nodeSpawn } from "node:child_process";
import { isJsonObject, } from "./protocol.js";
import { AgencClient, } from "./client.js";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_READY_TIMEOUT_MS = 45_000;
const READY_POLL_MS = 50;
/** Mirrors the daemon transports' 16 MiB max-line bound. */
const MAX_CLIENT_BUFFER_BYTES = 16 * 1024 * 1024;
// These RPCs respond only after the full model/tool turn. They must not inherit
// the short control-RPC timeout: SDK-backed agents may legitimately run for
// hours. Explicit cancellation, socket closure, and daemon shutdown still
// settle them.
const UNBOUNDED_DAEMON_METHODS = new Set([
    "message.send",
    "message.stream",
]);
export function resolveAgencHome(env = process.env, userHome = homedir()) {
    const configured = env.AGENC_HOME?.trim();
    return configured && configured.length > 0
        ? configured
        : join(userHome, ".agenc");
}
export function resolveDaemonSocketPath(env = process.env, userHome, platform = process.platform) {
    const daemonHome = resolveAgencHome(env, userHome);
    if (platform !== "win32") {
        return join(daemonHome, "daemon.sock");
    }
    const identity = createHash("sha256")
        .update(win32.resolve(daemonHome).toLowerCase())
        .digest("hex");
    return `\\\\.\\pipe\\agenc-daemon-${identity}`;
}
export function resolveDaemonCookiePath(env = process.env, userHome) {
    return join(resolveAgencHome(env, userHome), "daemon.cookie");
}
/**
 * Persistent newline-JSON socket transport. Single connection, no reconnect
 * layer — embedders that need reconnect can recreate the client via
 * {@link connect}.
 */
export class AgencSocketTransport {
    #socket;
    #pending = new Map();
    #requestTimeoutMs;
    #onNotification;
    #buffer = "";
    #closed = false;
    constructor(socket, options) {
        this.#socket = socket;
        this.#requestTimeoutMs =
            options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        this.#onNotification = options.onNotification;
        socket.setEncoding("utf8");
        socket.on("data", (chunk) => {
            this.#handleData(chunk, options.onClose);
        });
        socket.once("error", (error) => {
            this.#failAll(error);
            if (!this.#closed) {
                this.#closed = true;
                options.onClose?.(error);
            }
        });
        socket.once("close", () => {
            this.#failAll(new Error("AgenC daemon connection closed"));
            if (!this.#closed) {
                this.#closed = true;
                options.onClose?.(null);
            }
        });
    }
    static connect(options) {
        return new Promise((resolve, reject) => {
            const socket = createConnection(options.socketPath);
            const timeout = setTimeout(() => {
                socket.destroy();
                reject(new Error(`Timed out connecting to daemon at ${options.socketPath}`));
            }, options.connectTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
            socket.once("error", (error) => {
                clearTimeout(timeout);
                reject(error);
            });
            socket.once("connect", () => {
                clearTimeout(timeout);
                socket.removeAllListeners("error");
                resolve(new AgencSocketTransport(socket, options));
            });
        });
    }
    request(request) {
        if (this.#closed) {
            return Promise.reject(new Error("AgenC daemon connection is closed"));
        }
        return new Promise((resolve, reject) => {
            const timeout = UNBOUNDED_DAEMON_METHODS.has(request.method)
                ? null
                : setTimeout(() => {
                    this.#pending.delete(request.id);
                    reject(new Error(`Timed out waiting for daemon response to ${request.method}`));
                }, this.#requestTimeoutMs);
            this.#pending.set(request.id, {
                resolve: (value) => {
                    if (timeout !== null)
                        clearTimeout(timeout);
                    resolve(value);
                },
                reject: (error) => {
                    if (timeout !== null)
                        clearTimeout(timeout);
                    reject(error);
                },
                timeout,
            });
            this.#socket.write(`${JSON.stringify(request)}\n`);
        });
    }
    async close() {
        if (this.#closed)
            return;
        this.#closed = true;
        this.#socket.destroy();
        this.#failAll(new Error("AgenC daemon connection closed"));
    }
    #handleData(chunk, onClose) {
        this.#buffer += chunk;
        if (Buffer.byteLength(this.#buffer, "utf8") > MAX_CLIENT_BUFFER_BYTES) {
            const overflow = new Error(`AgenC daemon connection exceeded ${MAX_CLIENT_BUFFER_BYTES} bytes without a complete message`);
            this.#buffer = "";
            this.#failAll(overflow);
            this.#closed = true;
            this.#socket.destroy(overflow);
            onClose?.(overflow);
            return;
        }
        let newlineIndex = this.#buffer.indexOf("\n");
        while (newlineIndex >= 0) {
            const line = this.#buffer.slice(0, newlineIndex).trim();
            this.#buffer = this.#buffer.slice(newlineIndex + 1);
            if (line.length > 0)
                this.#handleLine(line);
            newlineIndex = this.#buffer.indexOf("\n");
        }
    }
    #handleLine(line) {
        let message;
        try {
            message = JSON.parse(line);
        }
        catch {
            return; // Ignore malformed frames; requests still time out safely.
        }
        if (!isJsonObject(message))
            return;
        if (typeof message.id === "string" || typeof message.id === "number") {
            const waiter = this.#pending.get(message.id);
            if (waiter === undefined)
                return;
            this.#pending.delete(message.id);
            waiter.resolve(message);
            return;
        }
        if (typeof message.method === "string") {
            this.#onNotification?.(message);
        }
    }
    #failAll(error) {
        for (const waiter of this.#pending.values()) {
            if (waiter.timeout !== null)
                clearTimeout(waiter.timeout);
            waiter.reject(error);
        }
        this.#pending.clear();
    }
}
/**
 * Connect to the local AgenC daemon (starting it through the CLI when
 * needed), perform the `initialize` handshake, and return a ready client.
 */
export async function connect(options = {}) {
    const env = options.env ?? process.env;
    const socketPath = options.socketPath ?? resolveDaemonSocketPath(env, options.userHome);
    const cookiePath = options.cookiePath ?? resolveDaemonCookiePath(env, options.userHome);
    const readyTimeoutMs = options.readyTimeoutMs ??
        positiveIntFromEnv(env.AGENC_DAEMON_READY_TIMEOUT_MS) ??
        DEFAULT_READY_TIMEOUT_MS;
    const requestTimeoutMs = options.requestTimeoutMs ??
        positiveIntFromEnv(env.AGENC_DAEMON_REQUEST_TIMEOUT_MS) ??
        DEFAULT_REQUEST_TIMEOUT_MS;
    let authCookie = await readDaemonCookie(cookiePath);
    let reachable = authCookie !== null && (await canConnect(socketPath));
    if (!reachable) {
        if (options.autostart === false) {
            throw new Error(`AgenC daemon is not running at ${socketPath} and autostart is disabled`);
        }
        await startDaemonViaCli(options.agencCommand ?? "agenc", env, options.spawn);
        const deadline = Date.now() + readyTimeoutMs;
        for (;;) {
            authCookie = await readDaemonCookie(cookiePath);
            if (authCookie !== null && (await canConnect(socketPath))) {
                reachable = true;
                break;
            }
            if (Date.now() >= deadline) {
                throw new Error(`AgenC daemon did not become ready at ${socketPath} within ${readyTimeoutMs}ms`);
            }
            await sleep(READY_POLL_MS);
        }
    }
    if (authCookie === null) {
        throw new Error(`daemon cookie is not available at ${cookiePath}`);
    }
    let client = null;
    const transport = await AgencSocketTransport.connect({
        socketPath,
        requestTimeoutMs,
        connectTimeoutMs: readyTimeoutMs,
        onNotification: (message) => client?.dispatchNotification(message),
        onClose: (error) => options.onDisconnect?.(error),
    });
    client = new AgencClient({
        transport,
        ...(options.clientId !== undefined ? { clientId: options.clientId } : {}),
        ...(options.clientName !== undefined
            ? { clientName: options.clientName }
            : {}),
        ...(options.onPermissionRequest !== undefined
            ? { onPermissionRequest: options.onPermissionRequest }
            : {}),
        ...(options.onElicitationRequest !== undefined
            ? { onElicitationRequest: options.onElicitationRequest }
            : {}),
    });
    try {
        await client.initialize({ authCookie });
    }
    catch (error) {
        await transport.close();
        throw error;
    }
    return client;
}
async function readDaemonCookie(cookiePath) {
    try {
        const cookie = (await readFile(cookiePath, "utf8")).trim();
        return cookie.length > 0 ? cookie : null;
    }
    catch (error) {
        const code = error?.code;
        if (code === "ENOENT")
            return null;
        throw error;
    }
}
function canConnect(socketPath) {
    return new Promise((resolve) => {
        const socket = createConnection(socketPath);
        socket.once("connect", () => {
            socket.destroy();
            resolve(true);
        });
        socket.once("error", () => {
            socket.destroy();
            resolve(false);
        });
    });
}
function startDaemonViaCli(command, env, spawnFn) {
    const [executable, ...prefixArgs] = typeof command === "string" ? [command] : command;
    if (executable === undefined || executable.length === 0) {
        throw new Error("agencCommand must name an executable");
    }
    const spawner = spawnFn ??
        ((cmd, args, spawnOptions) => nodeSpawn(cmd, [...args], spawnOptions));
    return new Promise((resolve, reject) => {
        const child = spawner(executable, [...prefixArgs, "daemon", "start"], {
            env,
            stdio: "ignore",
        });
        child.once("error", (error) => {
            reject(new Error(`failed to start AgenC daemon via ${executable}: ${error.message}`));
        });
        child.once("exit", (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`AgenC daemon start exited with code ${code ?? "null"} (command: ${executable})`));
        });
    });
}
function positiveIntFromEnv(raw) {
    const trimmed = raw?.trim();
    if (trimmed === undefined || trimmed.length === 0)
        return null;
    const value = Number.parseInt(trimmed, 10);
    return Number.isInteger(value) && value > 0 ? value : null;
}
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
//# sourceMappingURL=socket.js.map