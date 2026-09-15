/**
 * Subprocess ("headless CLI") transport.
 *
 * Instead of speaking JSON-RPC to the daemon socket, this transport spawns
 * `agenc -p --output-format stream-json --input-format stream-json` and
 * adapts its line-delimited output onto the same event-iterable interface
 * as {@link AgencSession.prompt}.
 *
 * stream-json contract (mirrors `runtime/src/bin/agenc.ts`):
 *   - stdin: one JSON object per line; `{"type":"prompt","prompt":"..."}`
 *     (also accepts `input_text` / user `message` records).
 *   - stdout: `{"type":"event","sessionId","agentId","event":<daemon
 *     notification>}` lines while the turn runs, then one final
 *     `{"type":"result","exitCode","finalMessage","deniedPermissionRequestIds",
 *     "tokenUsage"?,"cacheStats"?}` line.
 *
 * Limitations (inherent to `agenc -p`): the run is one-shot and
 * non-interactive — the CLI auto-DENIES permission requests, so permission
 * callbacks cannot grant tools over this transport. Exit code 2 marks a
 * tool-denied giveup, exactly like the CLI.
 */
import { type AgencPromptEvent, type AgencPromptResult } from "./events.js";
export interface AgencSubprocessChild {
    readonly stdin: {
        write(chunk: string): unknown;
        end(): unknown;
        on(event: "error", listener: (error: Error) => void): unknown;
    } | null;
    readonly stdout: {
        setEncoding(encoding: string): unknown;
        on(event: "data", listener: (chunk: string) => void): unknown;
    } | null;
    readonly stderr: {
        setEncoding(encoding: string): unknown;
        on(event: "data", listener: (chunk: string) => void): unknown;
    } | null;
    once(event: "error", listener: (error: Error) => void): unknown;
    once(event: "exit", listener: (code: number | null, signal: string | null) => void): unknown;
    kill(signal?: string): unknown;
}
export type AgencSubprocessSpawnFn = (command: string, args: readonly string[], options: {
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly stdio: readonly ["pipe", "pipe", "pipe"];
}) => AgencSubprocessChild;
export interface AgencSubprocessOptions {
    /**
     * Executable (plus fixed prefix args) for the AgenC CLI. Defaults to
     * `"agenc"` on PATH.
     */
    readonly agencCommand?: string | readonly string[];
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly model?: string;
    readonly provider?: string;
    readonly profile?: string;
    readonly permissionMode?: "default" | "plan" | "acceptEdits" | "bypassPermissions";
    /** Extra argv appended verbatim after the built-in flags. */
    readonly extraArgs?: readonly string[];
    readonly signal?: AbortSignal;
    /** Injectable for tests. */
    readonly spawn?: AgencSubprocessSpawnFn;
}
/** Event-iterable prompt run over the subprocess transport. */
export interface AgencSubprocessRun extends AsyncIterable<AgencPromptEvent> {
    result(): Promise<AgencPromptResult>;
    /** SIGTERM the child. */
    cancel(): void;
}
/**
 * Run one headless prompt through the AgenC CLI and stream typed events.
 */
export declare function promptViaSubprocess(prompt: string, options?: AgencSubprocessOptions): AgencSubprocessRun;
//# sourceMappingURL=subprocess.d.ts.map