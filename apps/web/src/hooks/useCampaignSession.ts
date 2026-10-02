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
import { loadFindingDetail, refetchTerminal, startFailure } from "./campaignFlow.js";

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
      stopStream.current?.();
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

  const reset = useCallback(() => {
    stopStream.current?.();
    stopStream.current = null;
    setStatus("idle");
    setError(null);
    setCampaign(null);
    setEvents([]);
    setFinding(null);
    setReplay(null);
    setUsage(null);
    setEvidence(null);
    setTerminal(null);
    setStreamEnded(false);
    setRefetch(null);
    setStartErrorCode(null);
    setFindingLoadError(null);
  }, []);

  const startFaulty = useCallback(async () => {
    stopStream.current?.();
    setStatus("connecting");
    setError(null);
    setEvents([]);
    setFinding(null);
    setReplay(null);
    setUsage(null);
    setEvidence(null);
    setTerminal(null);
    setStreamEnded(false);
    setRefetch(null);
    setStartErrorCode(null);
    setFindingLoadError(null);
    try {
      const created = await createCampaign("faulty");
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
        stopStream.current = streamCampaignEvents(campaignId, {
          onEvent: (event: CampaignEvent) => {
            setEvents((prev) => {
              if (prev.some((e) => e.eventId === event.eventId)) return prev;
              return [...prev, event].sort((a, b) => a.sequence - b.sequence);
            });
          },
          onDone: (done) => {
            setTerminal(done);
            setStreamEnded(true);
            void settle(done).finally(() => {
              setStatus("ready");
              resolve();
            });
          },
          onError: () => {
            setError("Event stream closed unexpectedly");
            setStreamEnded(true);
            void settle(null).finally(() => {
              setStatus("ready");
              resolve();
            });
          },
        });
      });

      if (latestFinding) {
        // RB-022: a finding-detail failure keeps the run's real status.
        const loaded = await loadFindingDetail(latestFinding.findingId, fetchFinding);
        if (loaded.ok) {
          setEvidence(loaded.evidence);
          setReplay(loaded.replay);
        } else {
          setFindingLoadError(loaded.error);
        }
      }
    } catch (err) {
      // The POST or the stream setup threw (refetch and finding load settle above).
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
    try {
      const res = await stopCampaign(campaign.campaignId);
      setCampaign(res.campaign);
    } catch (err) {
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
