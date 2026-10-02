// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Campaign, CampaignEvent, Finding, ReplayResult, UsageLedger } from "@rulebreak/contracts";
import type {
  CampaignDetail,
  CreateCampaignResponse,
  FindingDetailResponse,
  HealthResponse,
  TargetsResponse,
} from "../api/client.js";
import type { TerminalStatus } from "../api/terminalStatus.js";

/**
 * RB-024 hook harness. The client module is faked: createCampaign,
 * fetchCampaign, fetchFinding and stopCampaign return deferred promises the
 * test resolves by hand; fetchHealth and fetchTargets resolve at once. The
 * fake event stream captures its handlers so the test drives done/error
 * itself. No timers, no network.
 */

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type StreamHandlers = {
  onEvent: (event: CampaignEvent) => void;
  onDone?: (terminal: TerminalStatus | null) => void;
  onError?: (err: Event) => void;
};

type FakeStream = { campaignId: string; handlers: StreamHandlers; closed: boolean };

const fake = vi.hoisted(() => ({
  creates: [] as Array<Deferred<CreateCampaignResponse>>,
  campaignFetches: new Map<string, Deferred<CampaignDetail>>(),
  findingFetches: new Map<string, Deferred<FindingDetailResponse>>(),
  streams: [] as FakeStream[],
  stops: [] as Array<{ campaignId: string; d: Deferred<{ campaign: Campaign }> }>,
}));

function pending<T>(map: Map<string, Deferred<T>>, id: string): Deferred<T> {
  let d = map.get(id);
  if (!d) {
    d = deferred<T>();
    map.set(id, d);
  }
  return d;
}

vi.mock("../api/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client.js")>();
  return {
    ...actual,
    fetchHealth: async (): Promise<HealthResponse> => ({ ok: true, mode: "offline" }),
    fetchTargets: async (): Promise<TargetsResponse> => ({ targets: [], rulePacks: [] }),
    createCampaign: () => {
      const d = deferred<CreateCampaignResponse>();
      fake.creates.push(d);
      return d.promise;
    },
    fetchCampaign: (id: string) => pending(fake.campaignFetches, id).promise,
    fetchFinding: (id: string) => pending(fake.findingFetches, id).promise,
    stopCampaign: (campaignId: string) => {
      const d = deferred<{ campaign: Campaign }>();
      fake.stops.push({ campaignId, d });
      return d.promise;
    },
    streamCampaignEvents: (campaignId: string, handlers: StreamHandlers) => {
      const stream: FakeStream = { campaignId, handlers, closed: false };
      fake.streams.push(stream);
      return () => {
        stream.closed = true;
      };
    },
  };
});

// Imported after vi.mock (hoisted), so the hook sees the fake client.
const { useCampaignSession } = await import("./useCampaignSession.js");

// ---- fixtures: run "a" and run "b" carry distinct ids, usage and evidence ----
const campaignOf = (id: string, status: string) => ({ campaignId: id, status }) as unknown as Campaign;
const findingOf = (id: string) => ({ findingId: `f-${id}`, status: "confirmed" }) as unknown as Finding;
const usageOf = (n: number) => ({ toolCalls: n, mutations: n }) as unknown as UsageLedger;
const replayOf = (id: string) => ({ replayId: `r-${id}` }) as unknown as ReplayResult;
const evidenceOf = (id: string) => ({ [`k-${id}`]: { before: `${id}-0`, after: `${id}-1` } });

const created = (id: string): CreateCampaignResponse => ({
  campaign: campaignOf(id, "running"),
  finding: findingOf(id),
  replay: null,
  status: "running",
  outcome: "pending",
  usage: usageOf(1),
  eventCount: 0,
});

const detail = (id: string, usage: number): CampaignDetail => ({
  campaign: campaignOf(id, "completed"),
  status: "completed",
  outcome: `outcome-${id}`,
  finding: findingOf(id),
  replay: null,
  usage: usageOf(usage),
  eventCount: 1,
});

const findingDetail = (id: string): FindingDetailResponse => ({
  finding: findingOf(id),
  replay: replayOf(id),
  campaign: campaignOf(id, "completed"),
  evidence: evidenceOf(id),
  exportDir: null,
});

const doneOf = (id: string): TerminalStatus => ({ status: "completed", outcome: `outcome-${id}` });

/** Flush microtasks inside act so React applies state from resolved promises. */
const flush = () => act(async () => {});

async function mountHook() {
  const hook = renderHook(() => useCampaignSession());
  await flush(); // fetchHealth / fetchTargets resolve harmlessly
  return hook;
}

type Hook = Awaited<ReturnType<typeof mountHook>>;

/**
 * Start a run and let its POST resolve. Returns the run's start promise in a
 * wrapper (an async function returning it bare would wait for it).
 */
async function startRun(hook: Hook, id: string): Promise<{ run: Promise<void> }> {
  let run!: Promise<void>;
  act(() => {
    run = hook.result.current.startFaulty();
  });
  await act(async () => {
    fake.creates.at(-1)!.resolve(created(id));
  });
  return { run };
}

/** Drive a run from POST to the end: done, GET refetch, finding detail. */
async function runToEnd(hook: Hook, id: string, usage: number) {
  const { run } = await startRun(hook, id);
  const stream = fake.streams.at(-1)!;
  await act(async () => stream.handlers.onDone?.(doneOf(id)));
  await act(async () => pending(fake.campaignFetches, id).resolve(detail(id, usage)));
  await act(async () => pending(fake.findingFetches, `f-${id}`).resolve(findingDetail(id)));
  await act(async () => run);
}

/**
 * A replaced or unmounted run must finish on its own once its wait is released. If a guard is
 * dropped it goes on to await a fake call nobody resolves; this fails with an
 * assertion instead of hanging until the test timeout.
 */
async function expectSettled(run: Promise<void>) {
  let settled = false;
  void run.then(() => {
    settled = true;
  });
  for (let i = 0; i < 5 && !settled; i++) await flush();
  expect(settled, "run should settle without further fake responses").toBe(true);
}

/**
 * The fake's maps are shared by every mount in a test, and a resolved entry
 * stays resolved. Clear them before a second mount reuses run id "b", so its
 * GET and finding load are fresh, not answered by the first mount's entries.
 */
function clearFake() {
  fake.creates.length = 0;
  fake.campaignFetches.clear();
  fake.findingFetches.clear();
  fake.streams.length = 0;
  fake.stops.length = 0;
}

function expectShowsRunB(hook: Hook) {
  const s = hook.result.current;
  expect(s.status).toBe("ready");
  expect(s.campaign?.campaignId).toBe("b");
  expect(s.terminal).toEqual({ status: "completed", outcome: "outcome-b" });
  expect(s.refetch).toBe("ok");
  expect(s.finding?.findingId).toBe("f-b");
  expect(s.usage).toEqual(usageOf(20));
  expect(s.evidence).toEqual(evidenceOf("b"));
  expect(s.replay).toEqual(replayOf("b"));
  expect(s.error).toBeNull();
  expect(s.findingLoadError).toBeNull();
}

beforeEach(clearFake);

afterEach(() => {
  cleanup();
});

describe("RB-024 useCampaignSession stale-run race", () => {
  it("a restart while the old run's refetch is in flight shows only the new run", async () => {
    const hook = await mountHook();
    const { run: runA } = await startRun(hook, "a");
    const streamA = fake.streams.at(-1)!;
    await act(async () => streamA.handlers.onDone?.(doneOf("a")));
    expect(fake.campaignFetches.has("a")).toBe(true); // A's GET is in flight

    await runToEnd(hook, "b", 20);
    expect(streamA.closed).toBe(true); // the old stream was stopped
    expectShowsRunB(hook);

    // A's refetch lands late: nothing changes. A's finding load is never started.
    expect(fake.findingFetches.has("f-a")).toBe(false);
    await act(async () => pending(fake.campaignFetches, "a").resolve(detail("a", 99)));
    await expectSettled(runA);
    expect(fake.findingFetches.has("f-a")).toBe(false);
    expectShowsRunB(hook);
  });

  it.each([
    ["late success", (d: Deferred<FindingDetailResponse>) => d.resolve(findingDetail("a"))],
    ["late failure", (d: Deferred<FindingDetailResponse>) => d.reject(new Error("late failure"))],
  ])("a restart while the old run's finding load is in flight shows only the new run (%s)", async (_label, land) => {
    const hook = await mountHook();
    const { run: runA } = await startRun(hook, "a");
    const streamA = fake.streams.at(-1)!;
    await act(async () => streamA.handlers.onDone?.(doneOf("a")));
    await act(async () => pending(fake.campaignFetches, "a").resolve(detail("a", 99)));
    expect(fake.findingFetches.has("f-a")).toBe(true); // A's finding load started before B

    await runToEnd(hook, "b", 20);
    expectShowsRunB(hook);

    await act(async () => land(pending(fake.findingFetches, "f-a")));
    await expectSettled(runA);
    expectShowsRunB(hook);
  });

  it("late callbacks from the old stream and a late POST failure do not write", async () => {
    const hook = await mountHook();
    // Run A: POST still pending when the user restarts.
    let runA!: Promise<void>;
    act(() => {
      runA = hook.result.current.startFaulty();
    });
    const createA = fake.creates.at(-1)!;

    await runToEnd(hook, "b", 20);
    await act(async () => createA.reject(new Error("network down")));
    await expectSettled(runA);
    expectShowsRunB(hook);
    expect(hook.result.current.startErrorCode).toBeNull();

    // Run C's stream handlers fire after run B took over (e.g. EventSource
    // events already queued): all are ignored. hook2 reuses id "b", so clear
    // the fake first (see clearFake).
    clearFake();
    const hook2 = await mountHook();
    const { run: runC } = await startRun(hook2, "c");
    const streamC = fake.streams.at(-1)!;
    await runToEnd(hook2, "b", 20);
    expect(streamC.closed).toBe(true);
    await act(async () => {
      streamC.handlers.onEvent({ eventId: "e-c", sequence: 1 } as unknown as CampaignEvent);
      streamC.handlers.onError?.(new Event("error"));
      streamC.handlers.onDone?.(doneOf("c"));
    });
    await expectSettled(runC);
    expectShowsRunB(hook2);
    expect(hook2.result.current.events).toEqual([]);
    expect(fake.campaignFetches.has("c")).toBe(false); // no stale refetch was started
  });

  it("a late successful POST from the old run does not write or open a stream", async () => {
    // Double-click race: run A's POST is still pending when run B starts.
    const hook = await mountHook();
    act(() => {
      void hook.result.current.startFaulty();
    });
    const createA = fake.creates.at(-1)!;

    await runToEnd(hook, "b", 20);
    await act(async () => createA.resolve(created("a")));
    await flush();
    expectShowsRunB(hook);
    expect(fake.streams.map((s) => s.campaignId)).toEqual(["b"]);
  });

  it("reset while a refetch is in flight stays idle", async () => {
    const hook = await mountHook();
    await startRun(hook, "a");
    const streamA = fake.streams.at(-1)!;
    await act(async () => streamA.handlers.onDone?.(doneOf("a")));
    act(() => hook.result.current.reset());
    expect(streamA.closed).toBe(true);

    // A's refetch lands late: nothing changes. A's finding load is never started.
    await act(async () => pending(fake.campaignFetches, "a").resolve(detail("a", 99)));
    expect(fake.findingFetches.has("f-a")).toBe(false);
    const s = hook.result.current;
    expect(s.status).toBe("idle");
    expect(s.campaign).toBeNull();
    expect(s.usage).toBeNull();
    expect(s.terminal).toBeNull();
    expect(s.evidence).toBeNull();
  });

  it("a Stop sent for the old run does not touch the new run when it lands late", async () => {
    // Stop resolves late with the old campaign.
    const hook = await mountHook();
    await startRun(hook, "a");
    let stopA!: Promise<void>;
    act(() => {
      stopA = hook.result.current.requestStop();
    });
    expect(fake.stops.map((s) => s.campaignId)).toEqual(["a"]);

    await runToEnd(hook, "b", 20);
    await act(async () => fake.stops[0]!.d.resolve({ campaign: campaignOf("a", "stopped") }));
    await act(async () => stopA);
    expectShowsRunB(hook);

    // Stop fails late: its error is not shown on the new run. hook2 reuses
    // id "b", so clear the fake first (see clearFake).
    clearFake();
    const hook2 = await mountHook();
    await startRun(hook2, "c");
    let stopC!: Promise<void>;
    act(() => {
      stopC = hook2.result.current.requestStop();
    });
    await runToEnd(hook2, "b", 20);
    await act(async () => fake.stops.at(-1)!.d.reject(new Error("stop failed")));
    await act(async () => stopC);
    expectShowsRunB(hook2);
  });
});

describe("RB-024 useCampaignSession clears the previous run on start", () => {
  it("a new run shows nothing from the finished run while its POST is pending", async () => {
    const hook = await mountHook();
    await runToEnd(hook, "a", 7);
    expect(hook.result.current.campaign?.campaignId).toBe("a");

    act(() => {
      void hook.result.current.startFaulty();
    });
    // POST for the new run has not resolved: every RunState field is fresh.
    const s = hook.result.current;
    expect(s.status).toBe("connecting");
    expect(s.campaign).toBeNull();
    expect(s.finding).toBeNull();
    expect(s.replay).toBeNull();
    expect(s.usage).toBeNull();
    expect(s.evidence).toBeNull();
    expect(s.terminal).toBeNull();
    expect(s.refetch).toBeNull();
    expect(s.streamEnded).toBe(false);
    expect(s.events).toEqual([]);
    expect(s.error).toBeNull();
    expect(s.startErrorCode).toBeNull();
    expect(s.findingLoadError).toBeNull();
  });
});

describe("RB-024 useCampaignSession unmount", () => {
  it("unmount mid-refetch ends the run without starting its finding load", async () => {
    const hook = await mountHook();
    const { run } = await startRun(hook, "a");
    const stream = fake.streams.at(-1)!;
    await act(async () => stream.handlers.onDone?.(doneOf("a")));
    expect(fake.campaignFetches.has("a")).toBe(true); // GET in flight

    hook.unmount();
    expect(stream.closed).toBe(true);
    await act(async () => pending(fake.campaignFetches, "a").resolve(detail("a", 5)));
    await expectSettled(run);
    expect(fake.findingFetches.has("f-a")).toBe(false);
  });

  it("unmount while the POST is pending opens no stream when it lands", async () => {
    const hook = await mountHook();
    let run!: Promise<void>;
    act(() => {
      run = hook.result.current.startFaulty();
    });
    hook.unmount();
    await act(async () => fake.creates.at(-1)!.resolve(created("a")));
    await expectSettled(run);
    expect(fake.streams).toEqual([]);
  });
});
