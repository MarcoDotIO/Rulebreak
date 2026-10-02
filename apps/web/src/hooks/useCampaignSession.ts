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
  ApiError,
  requestFailureText,
} from "../api/client.js";
import type { TerminalStatus } from "../api/terminalStatus.js";

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
  /** Campaign refetch after the stream closed: "ok", "failed", or null before it. */
  refetch: "ok" | "failed" | null;
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
  const [refetch, setRefetch] = useState<"ok" | "failed" | null>(null);
  const [startErrorCode, setStartErrorCode] = useState<string | null>(null);
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
  }, []);

  const startFaulty = useCallback(async () => {
    stopStream.current?.();
    setStatus("connecting");
    setError(null);
    setEvents([]);
    setFinding(null);
    setReplay(null);
    setEvidence(null);
    setTerminal(null);
    setStreamEnded(false);
    setRefetch(null);
    setStartErrorCode(null);
    try {
      const created = await createCampaign("faulty");
      const campaignId = created.campaign.campaignId;
      setCampaign(created.campaign);
      setFinding(created.finding);
      setReplay(created.replay);
      setUsage(created.usage);
      setStatus("streaming");

      /** Refetch is the source of truth once the stream closes (done or dropped). */
      const refetchTerminal = async (fallback: TerminalStatus | null) => {
        try {
          const detail = await fetchCampaign(campaignId);
          setCampaign(detail.campaign);
          setFinding(detail.finding);
          setTerminal({ status: detail.status, outcome: detail.outcome });
          setRefetch("ok");
        } catch {
          setTerminal(fallback);
          setRefetch("failed");
        }
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
            void refetchTerminal(done).finally(() => {
              setStatus("ready");
              resolve();
            });
          },
          onError: () => {
            setError("Event stream closed unexpectedly");
            setStreamEnded(true);
            void refetchTerminal(null).finally(() => {
              setStatus("ready");
              resolve();
            });
          },
        });
      });

      if (created.finding) {
        const detail = await fetchFinding(created.finding.findingId);
        setEvidence(detail.evidence);
        setReplay(detail.replay);
      }
    } catch (err) {
      setStatus("error");
      if (err instanceof ApiError && err.code === "start_error") {
        // RB-021: no session exists; the POST body is the final word.
        setStartErrorCode(err.code);
        setTerminal({ status: err.status ?? "failed", outcome: err.outcome ?? "error" });
        setStreamEnded(true);
        setError(`Failed to start${err.campaignId ? ` (campaign ${err.campaignId})` : ""}.`);
        return;
      }
      // Any other failure (including a 401/503 with no code) says nothing about
      // a campaign: show it as a request failure, never as start_error.
      setError(requestFailureText(err));
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
    startErrorCode,
    startFaulty,
    requestStop,
    setLiveAgentsEnabled,
    reset,
  };
}
