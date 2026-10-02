import { describe, expect, it } from "vitest";
import type { CampaignEvent } from "@rulebreak/contracts";
import { failedLabel, parseDonePayload, systemErrorCode, terminalView } from "./terminalStatus";

function expectHonest(text: string) {
  expect(text).not.toMatch(/secure/i);
  expect(text).not.toMatch(/verified correct/i);
}

describe("RB-020 terminal status display", () => {
  it("parses the done payload and ignores ok:true", () => {
    expect(
      parseDonePayload(
        JSON.stringify({ ok: true, campaignId: "c1", status: "failed", outcome: "error" }),
      ),
    ).toEqual({ status: "failed", outcome: "error" });
    expect(parseDonePayload(JSON.stringify({ ok: true }))).toBeNull();
    expect(parseDonePayload("not json")).toBeNull();
    expect(parseDonePayload(undefined)).toBeNull();
  });

  it("an error run is failed with partial actions and never gets no-finding copy", () => {
    const v = terminalView(
      { status: "failed", outcome: "error" },
      { streamEnded: true, errorCode: "verifier_error" },
    );
    expect(v.finished).toBe(true);
    expect(v.label).toBe("Failed (verifier error), partial actions recorded");
    expect(v.pillKind).toBe("error");
    expect(v.noFindingCopy).not.toMatch(/No finding yet|No violation observed/);
    expectHonest(v.label + v.noFindingCopy);
  });

  it("names a replay error from the system_error event", () => {
    const events = [
      { type: "system_error", payload: { code: "replay_error", message: "x" } },
    ] as unknown as CampaignEvent[];
    expect(systemErrorCode(events)).toBe("replay_error");
    const v = terminalView(
      { status: "failed", outcome: "error" },
      { streamEnded: true, errorCode: systemErrorCode(events) },
    );
    expect(v.label).toBe("Failed (replay error) after the run");
  });

  it("a completed run with no violation reads as a single-run observation, neutral pill", () => {
    const v = terminalView(
      { status: "completed", outcome: "no_violation_observed" },
      { streamEnded: true },
    );
    expect(v.noFindingCopy).toBe("No violation observed in this run.");
    expect(v.pillKind).toBe("neutral");
    expectHonest(v.label + v.noFindingCopy);
  });

  it("a finished campaign never shows running", () => {
    const pairs: Array<[string, string]> = [
      ["completed", "no_violation_observed"],
      ["completed", "violation_candidate"],
      ["completed", "violation_confirmed"],
      ["stopped", "stopped"],
      ["failed", "error"],
    ];
    for (const [status, outcome] of pairs) {
      const v = terminalView({ status, outcome }, { streamEnded: true });
      expect(v.finished).toBe(true);
      expect(v.label).not.toMatch(/running|pending/i);
    }
  });

  it("a stream that drops with no done event and no refetch is unknown, not clean or running", () => {
    const v = terminalView(null, { streamEnded: true });
    expect(v.finished).toBe(false);
    expect(v.label).not.toMatch(/running/i);
    expect(v.noFindingCopy).not.toMatch(/No finding yet|No violation observed/);
    expect(v.noFindingCopy).toMatch(/not a clean result/);
  });

  it("stopped is never presented as a no-violation result", () => {
    const v = terminalView({ status: "stopped", outcome: "stopped" }, { streamEnded: true });
    expect(v.noFindingCopy).toMatch(/not a no-violation result/);
  });

  it("maps run_error and unknown codes to their own labels, never to verifier error", () => {
    expect(failedLabel("run_error", null)).toBe("Failed (run error), partial actions recorded");
    expect(failedLabel("something_new", null)).toBe("Failed (error)");
    expect(failedLabel(null, null)).toBe("Failed (error)");
    for (const code of ["run_error", "something_new", null]) {
      expect(failedLabel(code, null)).not.toMatch(/verifier/);
    }
  });

  it("a confirmed finding on a failed campaign keeps both: confirmed finding, failed run", () => {
    const v = terminalView(
      { status: "failed", outcome: "error" },
      { streamEnded: true, errorCode: "replay_error", findingStatus: "confirmed" },
    );
    expect(v.label).toBe("Failed after confirmation (export or control replay error)");
    expect(v.pillKind).toBe("error");
    expect(v.finished).toBe(true);
    expect(v.label).not.toMatch(/no violation|completed/i);
  });

  it("while a run is streaming, the no-finding copy does not ask to start a run", () => {
    const v = terminalView({ status: "running", outcome: null }, { streamEnded: false, inFlight: true });
    expect(v.noFindingCopy).toBe("No finding yet — the run is still in progress.");
    const idle = terminalView(null, { streamEnded: false });
    expect(idle.noFindingCopy).toBe("No finding yet — run the faulty scripted campaign first.");
  });
});
