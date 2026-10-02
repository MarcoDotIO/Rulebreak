import type { CampaignEvent } from "@rulebreak/contracts";

/**
 * RB-020 terminal status (docs/contracts/rb-020-terminal-status.md).
 * The `done` SSE event, GET /api/campaigns/:id and POST /api/campaigns all carry
 * the same top-level `status` and `outcome`. `done.ok` only means the stream
 * finished sending — never read it as a clean result.
 */
export type TerminalStatus = {
  status: string;
  outcome: string | null;
};

export type TerminalSource = "done_event" | "refetch" | "create" | "none";

export type TerminalView = {
  /** True once the campaign has a finished status; never true for pending/running. */
  finished: boolean;
  label: string;
  /** StatusPill kind. A no-violation run is neutral, never a green or "secure" pill. */
  pillKind: string;
  /** Copy for the finding panel when there is no finding. */
  noFindingCopy: string;
};

const FINISHED = new Set(["completed", "stopped", "failed"]);

/** Parse the `done` SSE payload; returns null when it has no usable status. */
export function parseDonePayload(data: unknown): TerminalStatus | null {
  if (typeof data !== "string" || data.length === 0) return null;
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    if (typeof parsed.status !== "string") return null;
    const outcome = typeof parsed.outcome === "string" ? parsed.outcome : null;
    return { status: parsed.status, outcome };
  } catch {
    return null;
  }
}

/** The system_error code (verifier_error / replay_error) from the event log, if any. */
export function systemErrorCode(events: readonly CampaignEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event && event.type === "system_error") return event.payload.code;
  }
  return null;
}

/**
 * Label for a failed / error campaign. Only codes the contract names get a
 * specific label; anything else stays a generic failure, never a verifier one.
 */
export function failedLabel(code: string | null, findingStatus: string | null): string {
  if (findingStatus === "confirmed") {
    // The replay really confirmed the finding; the error came after it.
    return "Failed after confirmation (export or control replay error)";
  }
  switch (code) {
    case "verifier_error":
      return "Failed (verifier error), partial actions recorded";
    case "run_error":
      return "Failed (run error), partial actions recorded";
    case "replay_error":
      return "Failed (replay error) after the run";
    default:
      return "Failed (error)";
  }
}

/**
 * Display for a campaign's terminal state. `terminal` is null while the
 * campaign is in flight, or when the stream closed without a done event and
 * the refetch also failed (then the status is reported as unknown, never clean).
 */
export function terminalView(
  terminal: TerminalStatus | null,
  opts: {
    streamEnded: boolean;
    errorCode?: string | null;
    /** The finding's own status; a campaign error never downgrades it. */
    findingStatus?: string | null;
    /** True while a run is in flight (connecting or streaming). */
    inFlight?: boolean;
  },
): TerminalView {
  if (!terminal || !FINISHED.has(terminal.status)) {
    if (opts.streamEnded) {
      return {
        finished: false,
        label: "Final status unknown (stream closed; refetch failed)",
        pillKind: "inconclusive",
        noFindingCopy:
          "Final status unknown — the event stream closed and the campaign could not be refetched. This is not a clean result.",
      };
    }
    return {
      finished: false,
      label: terminal?.status === "pending" ? "Pending" : "Running",
      pillKind: "neutral",
      noFindingCopy: opts.inFlight
        ? "No finding yet — the run is still in progress."
        : "No finding yet — run the faulty scripted campaign first.",
    };
  }

  const { status, outcome } = terminal;
  if (status === "failed" || outcome === "error") {
    const label = failedLabel(opts.errorCode ?? null, opts.findingStatus ?? null);
    return {
      finished: true,
      label,
      pillKind: "error",
      noFindingCopy: `${label}. This run ended on an error; it is not a no-violation result.`,
    };
  }
  if (status === "stopped") {
    return {
      finished: true,
      label: "Stopped by operator",
      pillKind: "neutral",
      noFindingCopy: "Stopped by operator before the run finished. This is not a no-violation result.",
    };
  }
  if (outcome === "violation_confirmed") {
    return {
      finished: true,
      label: "Completed — violation confirmed by replay",
      pillKind: "confirmed",
      noFindingCopy: "Completed — violation confirmed by replay.",
    };
  }
  if (outcome === "violation_candidate") {
    return {
      finished: true,
      label: "Completed — violation candidate (replay did not confirm)",
      pillKind: "candidate",
      noFindingCopy: "Completed — violation candidate (replay did not confirm).",
    };
  }
  if (outcome === "no_violation_observed") {
    return {
      finished: true,
      label: "Completed — no violation observed in this run",
      pillKind: "neutral",
      noFindingCopy: "No violation observed in this run.",
    };
  }
  return {
    finished: true,
    label: `Completed (outcome ${outcome ?? "not recorded"})`,
    pillKind: "inconclusive",
    noFindingCopy: `Completed with outcome ${outcome ?? "not recorded"}.`,
  };
}
