import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Campaign,
  CampaignEvent,
  Finding,
  ProvenanceMode,
  ReplayResult,
  TargetManifest,
  UsageLedger,
} from "@rulebreak/contracts";
import {
  createCampaign,
  fetchCampaign,
  fetchFinding,
  fetchHealth,
  fetchTargets,
  stopCampaign,
  streamCampaignEvents,
  type FindingDetailResponse,
  type ThorDualAgentCapabilities,
} from "../api/client.js";
import type { RefetchResult, TerminalStatus } from "../api/terminalStatus.js";
import {
  freshRunState,
  loadFindingDetail,
  refetchTerminal,
  startFailure,
  type RunState,
} from "./campaignFlow.js";

export type SessionStatus =
  | "idle"
  | "connecting"
  | "streaming"
  | "ready"
  | "error";

export type CampaignSessionState = {
  status: SessionStatus;
  error: string | null;
  /** Control API reachable (not the same as live-agent provenance). */
  live: boolean;
  /** Operator enabled Thor dual-agent live provenance (SSH≠G4; not AgenC). */
  liveAgentsEnabled: boolean;
  /** Provenance for dual-agent enablement UI — live only when enabled honestly. */
  provenanceMode: ProvenanceMode;
  thorDualAgent: ThorDualAgentCapabilities | null;
  targets: TargetManifest[];
  rulePackId: string;
  campaign: Campaign | null;
  events: CampaignEvent[];
  finding: Finding | null;
  replay: ReplayResult | null;
  usage: UsageLedger | null;
  evidence: FindingDetailResponse["evidence"];
  /** RB-020 final status/outcome from the done event, confirmed by refetch. */
  terminal: TerminalStatus | null;
  /** True once the event stream has closed (done or dropped). */
  streamEnded: boolean;
  /** Campaign refetch after the stream closed: "ok", "failed", "not_found", or null before it. */
  refetch: RefetchResult | null;
  /** RB-022: set when finding details failed to load; the run's status is unchanged. */
  findingLoadError: string | null;
  /** Typed failure code from a non-2xx POST (e.g. start_error); events carry the rest. */
  startErrorCode: string | null;
  startFaulty: () => Promise<void>;
  requestStop: () => Promise<void>;
  setLiveAgentsEnabled: (enabled: boolean) => void;
  reset: () => void;
};

/** RB-024: a setter for every RunState field, each typed to its field. */
type RunStateSetters = { [K in keyof RunState]: (value: RunState[K]) => void };

function applyRunStateWith(setters: RunStateSetters, s: RunState): void {
  const apply = <K extends keyof RunState>(key: K) => setters[key](s[key]);
  for (const key of Object.keys(setters) as Array<keyof RunState>) apply(key);
}

export function useCampaignSession(): CampaignSessionState {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [liveAgentsEnabled, setLiveAgentsEnabledState] = useState(false);
  const [thorDualAgent, setThorDualAgent] =
    useState<ThorDualAgentCapabilities | null>(null);
  const [targets, setTargets] = useState<TargetManifest[]>([]);
  const [rulePackId, setRulePackId] = useState("rulebreak-trade-v1");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [events, setEvents] = useState<CampaignEvent[]>([]);
  const [finding, setFinding] = useState<Finding | null>(null);
  const [replay, setReplay] = useState<ReplayResult | null>(null);
  const [usage, setUsage] = useState<UsageLedger | null>(null);
  const [evidence, setEvidence] =
    useState<FindingDetailResponse["evidence"]>(null);
  const [terminal, setTerminal] = useState<TerminalStatus | null>(null);
  const [streamEnded, setStreamEnded] = useState(false);
  const [refetch, setRefetch] = useState<RefetchResult | null>(null);
  const [startErrorCode, setStartErrorCode] = useState<string | null>(null);
  const [findingLoadError, setFindingLoadError] = useState<string | null>(null);
  const stopStream = useRef<(() => void) | null>(null);
  /**
   * RB-024 run-generation token. Bumped by every startFaulty and reset (and on
   * unmount). Each async continuation writes state only while its run is
   * still the current one: the POST result, the stream callbacks (onEvent,
   * onDone, onError), the refetch and its "ready" status, the finding load,
   * the start-failure catch, and requestStop. So a late result from an
   * earlier run does not overwrite the new run's status, finding or usage.
   */
  const runGen = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const health = await fetchHealth();
        if (cancelled) return;
        setLive(Boolean(health.ok));
        setThorDualAgent(health.thorDualAgent ?? null);
        const catalog = await fetchTargets();
        if (cancelled) return;
        setTargets(catalog.targets);
        if (catalog.rulePacks[0]) setRulePackId(catalog.rulePacks[0].rulePackId);
      } catch {
        if (!cancelled) {
          setLive(false);
          setThorDualAgent(null);
          setError("Control API unreachable — start npm run dev:server");
        }
      }
    })();
    return () => {
      cancelled = true;
      runGen.current += 1;
      stopStream.current?.();
      stopStream.current = null;
    };
  }, []);

  const setLiveAgentsEnabled = useCallback(
    (enabled: boolean) => {
      if (enabled && !thorDualAgent?.canEnableLiveAgents) {
        setError(
          "Thor dual-agent enablement unavailable — need RULEBREAK_LIVE_ENABLED + Thor credentials, or #48 Pass evidence artifact",
        );
        return;
      }
      setError(null);
      setLiveAgentsEnabledState(enabled);
    },
    [thorDualAgent],
  );

  /**
   * RB-024: one setter per RunState field. The type requires every key and
   * matches each setter to its field, so dropping a field here fails tsc.
   */
  const runStateSetters: RunStateSetters = {
    error: setError,
    campaign: setCampaign,
    events: setEvents,
    finding: setFinding,
    replay: setReplay,
    usage: setUsage,
    evidence: setEvidence,
    terminal: setTerminal,
    streamEnded: setStreamEnded,
    refetch: setRefetch,
    startErrorCode: setStartErrorCode,
    findingLoadError: setFindingLoadError,
  };

  // useState setters are stable, so the first render's map stays valid.
  const applyRunState = useCallback((s: RunState) => {
    applyRunStateWith(runStateSetters, s);
  }, []);

  const reset = useCallback(() => {
    runGen.current += 1;
    stopStream.current?.();
    stopStream.current = null;
    setStatus("idle");
    applyRunState(freshRunState());
  }, [applyRunState]);

  const startFaulty = useCallback(async () => {
    const gen = ++runGen.current;
    const isCurrent = () => runGen.current === gen;
    stopStream.current?.();
    stopStream.current = null;
    setStatus("connecting");
    applyRunState(freshRunState());
    try {
      const created = await createCampaign("faulty");
      if (!isCurrent()) return;
      const campaignId = created.campaign.campaignId;
      setCampaign(created.campaign);
      setFinding(created.finding);
      setReplay(created.replay);
      setUsage(created.usage);
      setStatus("streaming");

      let latestFinding = created.finding;
      /** Refetch is the source of truth once the stream closes (done or dropped). */
      const settle = async (fallback: TerminalStatus | null) => {
        const result = await refetchTerminal(campaignId, fallback, fetchCampaign);
        if (!isCurrent()) return;
        if (result.campaign) setCampaign(result.campaign);
        if (result.usage !== undefined) setUsage(result.usage);
        if (result.finding !== undefined) {
          setFinding(result.finding);
          latestFinding = result.finding;
        }
        setTerminal(result.terminal);
        setRefetch(result.refetch);
      };

      await new Promise<void>((resolve) => {
        const close = streamCampaignEvents(campaignId, {
          onEvent: (event: CampaignEvent) => {
            if (!isCurrent()) return;
            setEvents((prev) => {
              if (prev.some((e) => e.eventId === event.eventId)) return prev;
              return [...prev, event].sort((a, b) => a.sequence - b.sequence);
            });
          },
          onDone: (done) => {
            if (!isCurrent()) return resolve();
            setTerminal(done);
            setStreamEnded(true);
            void settle(done).finally(() => {
              if (isCurrent()) setStatus("ready");
              resolve();
            });
          },
          onError: () => {
            if (!isCurrent()) return resolve();
            setError("Event stream closed unexpectedly");
            setStreamEnded(true);
            void settle(null).finally(() => {
              if (isCurrent()) setStatus("ready");
              resolve();
            });
          },
        });
        // Stopping this run's stream (restart, reset, unmount) also releases this wait.
        stopStream.current = () => {
          close();
          resolve();
        };
      });
      if (!isCurrent()) return;

      if (latestFinding) {
        // RB-022: a finding-detail failure keeps the run's real status.
        const loaded = await loadFindingDetail(latestFinding.findingId, fetchFinding);
        if (!isCurrent()) return;
        if (loaded.ok) {
          setEvidence(loaded.evidence);
          setReplay(loaded.replay);
        } else {
          setFindingLoadError(loaded.error);
        }
      }
    } catch (err) {
      // The POST or the stream setup threw (refetch and finding load settle above).
      if (!isCurrent()) return;
      setStatus("error");
      const failure = startFailure(err);
      setStartErrorCode(failure.startErrorCode);
      setTerminal(failure.terminal);
      setStreamEnded(failure.streamEnded);
      setError(failure.error);
      setUsage(failure.usage);
    }
  }, []);

  const requestStop = useCallback(async () => {
    if (!campaign) return;
    const gen = runGen.current;
    try {
      const res = await stopCampaign(campaign.campaignId);
      if (runGen.current !== gen) return;
      setCampaign(res.campaign);
    } catch (err) {
      if (runGen.current !== gen) return;
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [campaign]);

  const provenanceMode: ProvenanceMode = liveAgentsEnabled ? "live" : "scripted";

  return {
    status,
    error,
    live,
    liveAgentsEnabled,
    provenanceMode,
    thorDualAgent,
    targets,
    rulePackId,
    campaign,
    events,
    finding,
    replay,
    usage,
    evidence,
    terminal,
    streamEnded,
    refetch,
    findingLoadError,
    startErrorCode,
    startFaulty,
    requestStop,
    setLiveAgentsEnabled,
    reset,
  };
}
