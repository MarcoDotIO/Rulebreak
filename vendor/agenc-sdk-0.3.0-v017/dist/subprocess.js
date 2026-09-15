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
import { spawn as nodeSpawn } from "node:child_process";
import { isJsonObject } from "./protocol.js";
import { promptEventFromNotification, stopReasonFromExitCode, } from "./events.js";
/** Cap on internally buffered, not-yet-consumed prompt events (mirrors client.ts). */
const MAX_BUFFERED_PROMPT_EVENTS = 1_000;
/**
 * Run one headless prompt through the AgenC CLI and stream typed events.
 */
export function promptViaSubprocess(prompt, options = {}) {
    const command = options.agencCommand ?? "agenc";
    const [executable, ...prefixArgs] = typeof command === "string" ? [command] : [...command];
    if (executable === undefined || executable.length === 0) {
        throw new Error("agencCommand must name an executable");
    }
    const args = [
        ...prefixArgs,
        "-p",
        "--output-format",
        "stream-json",
        "--input-format",
        "stream-json",
        ...(options.model !== undefined ? ["--model", options.model] : []),
        ...(options.provider !== undefined ? ["--provider", options.provider] : []),
        ...(options.profile !== undefined ? ["--profile", options.profile] : []),
        ...(options.permissionMode !== undefined
            ? ["--permission-mode", options.permissionMode]
            : []),
        ...(options.extraArgs ?? []),
    ];
    const spawner = options.spawn ??
        ((spawnCommand, spawnArgs, spawnOptions) => nodeSpawn(spawnCommand, [...spawnArgs], {
            ...spawnOptions,
            stdio: [...spawnOptions.stdio],
        }));
    const child = spawner(executable, args, {
        ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
        ...(options.env !== undefined ? { env: options.env } : {}),
        stdio: ["pipe", "pipe", "pipe"],
    });
    const buffered = [];
    let wake = null;
    let done = false;
    let failure = null;
    let finalResult = null;
    let resultLine = null;
    let stderrTail = "";
    let stdoutRemainder = "";
    let resolveResult;
    let rejectResult;
    const resultPromise = new Promise((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
    });
    resultPromise.catch(() => { });
    const notify = () => {
        wake?.();
        wake = null;
    };
    // Removes the abort listener on completion so a reused long-lived AbortSignal
    // does not accumulate one dead listener per prompt run.
    let removeAbortListener = null;
    const runCleanup = () => {
        removeAbortListener?.();
        removeAbortListener = null;
    };
    const finishOk = (value) => {
        if (done)
            return;
        done = true;
        finalResult = value;
        runCleanup();
        resolveResult(value);
        notify();
    };
    const finishError = (error) => {
        if (done)
            return;
        done = true;
        failure = error;
        runCleanup();
        rejectResult(error);
        notify();
    };
    const handleLine = (line) => {
        const trimmed = line.trim();
        if (trimmed.length === 0)
            return;
        let parsed;
        try {
            parsed = JSON.parse(trimmed);
        }
        catch {
            return; // non-JSON noise on stdout is ignored
        }
        if (!isJsonObject(parsed))
            return;
        if (parsed.type === "event" && isJsonObject(parsed.event)) {
            const event = promptEventFromNotification(parsed.event);
            if (event !== null && !done) {
                buffered.push(event);
                while (buffered.length > MAX_BUFFERED_PROMPT_EVENTS)
                    buffered.shift();
                notify();
            }
            return;
        }
        if (parsed.type === "result") {
            resultLine = parsed;
        }
    };
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
        stdoutRemainder += chunk;
        let newlineIndex = stdoutRemainder.indexOf("\n");
        while (newlineIndex >= 0) {
            handleLine(stdoutRemainder.slice(0, newlineIndex));
            stdoutRemainder = stdoutRemainder.slice(newlineIndex + 1);
            newlineIndex = stdoutRemainder.indexOf("\n");
        }
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
        stderrTail = `${stderrTail}${chunk}`.slice(-8_192);
    });
    child.once("error", (error) => {
        finishError(new Error(`failed to spawn AgenC CLI (${executable}): ${error.message}`));
    });
    child.once("exit", (code, signal) => {
        if (stdoutRemainder.length > 0) {
            handleLine(stdoutRemainder);
            stdoutRemainder = "";
        }
        if (resultLine !== null) {
            const line = resultLine;
            const exitCode = typeof line.exitCode === "number" ? line.exitCode : code ?? 1;
            const denied = Array.isArray(line.deniedPermissionRequestIds)
                ? line.deniedPermissionRequestIds.filter((value) => typeof value === "string")
                : [];
            finishOk({
                stopReason: stopReasonFromExitCode(exitCode),
                exitCode,
                finalMessage: typeof line.finalMessage === "string" ? line.finalMessage : "",
                deniedPermissionRequestIds: denied,
                ...(isJsonObject(line.tokenUsage) ? { usage: line.tokenUsage } : {}),
                ...(isJsonObject(line.cacheStats)
                    ? { cacheStats: line.cacheStats }
                    : {}),
            });
            return;
        }
        finishError(new Error(`AgenC CLI exited (code ${code ?? "null"}${signal !== null ? `, signal ${signal}` : ""}) without a stream-json result${stderrTail.trim().length > 0 ? `: ${stderrTail.trim()}` : ""}`));
    });
    if (options.signal !== undefined) {
        const abortSignal = options.signal;
        const onAbort = () => child.kill("SIGTERM");
        if (abortSignal.aborted) {
            onAbort();
        }
        else {
            abortSignal.addEventListener("abort", onAbort, { once: true });
            removeAbortListener = () => abortSignal.removeEventListener("abort", onAbort);
        }
    }
    if (child.stdin === null) {
        finishError(new Error("AgenC CLI child has no stdin pipe"));
    }
    else {
        // Without an "error" listener a broken stdin pipe (the child exited before
        // draining stdin — startup crash, bad flag) surfaces as an uncaught EPIPE in
        // the embedder's process. child.once("error") (above) only covers
        // ChildProcess spawn errors, not stream errors — route those into finishError.
        child.stdin.on("error", (error) => {
            finishError(new Error(`AgenC CLI stdin write failed: ${error.message}`));
        });
        child.stdin.write(`${JSON.stringify({ type: "prompt", prompt })}\n`);
        child.stdin.end();
    }
    return {
        result: () => resultPromise,
        cancel: () => {
            child.kill("SIGTERM");
        },
        async *[Symbol.asyncIterator]() {
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
//# sourceMappingURL=subprocess.js.map