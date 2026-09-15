import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Campaign,
  CampaignEvent,
  Finding,
  ReplayResult,
  TargetManifest,
  UsageLedger,
} from "@rulebreak/contracts";
import {
  createCampaign,
  fetchFinding,
  fetchHealth,
  fetchTargets,
  stopCampaign,
  streamCampaignEvents,
  type FindingDetailResponse,
} from "../api/client.js";

export type SessionStatus =
  | "idle"
  | "connecting"
  | "streaming"
  | "ready"
  | "error";

export type CampaignSessionState = {
  status: SessionStatus;
  error: string | null;
  live: boolean;
  targets: TargetManifest[];
  rulePackId: string;
  campaign: Campaign | null;
  events: CampaignEvent[];
  finding: Finding | null;
  replay: ReplayResult | null;
  usage: UsageLedger | null;
  evidence: FindingDetailResponse["evidence"];
  startFaulty: () => Promise<void>;
  requestStop: () => Promise<void>;
  reset: () => void;
};

export function useCampaignSession(): CampaignSessionState {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [targets, setTargets] = useState<TargetManifest[]>([]);
  const [rulePackId, setRulePackId] = useState("rulebreak-trade-v1");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [events, setEvents] = useState<CampaignEvent[]>([]);
  const [finding, setFinding] = useState<Finding | null>(null);
  const [replay, setReplay] = useState<ReplayResult | null>(null);
  const [usage, setUsage] = useState<UsageLedger | null>(null);
  const [evidence, setEvidence] =
    useState<FindingDetailResponse["evidence"]>(null);
  const stopStream = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const health = await fetchHealth();
        if (cancelled) return;
        setLive(Boolean(health.ok));
        const catalog = await fetchTargets();
        if (cancelled) return;
        setTargets(catalog.targets);
        if (catalog.rulePacks[0]) setRulePackId(catalog.rulePacks[0].rulePackId);
      } catch {
        if (!cancelled) {
          setLive(false);
          setError("Control API unreachable — start npm run dev:server");
        }
      }
    })();
    return () => {
      cancelled = true;
      stopStream.current?.();
    };
  }, []);

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
  }, []);

  const startFaulty = useCallback(async () => {
    stopStream.current?.();
    setStatus("connecting");
    setError(null);
    setEvents([]);
    setFinding(null);
    setReplay(null);
    setEvidence(null);
    try {
      const created = await createCampaign("faulty");
      setCampaign(created.campaign);
      setFinding(created.finding);
      setReplay(created.replay);
      setUsage(created.usage);
      setStatus("streaming");

      await new Promise<void>((resolve) => {
        stopStream.current = streamCampaignEvents(created.campaign.campaignId, {
          onEvent: (event: CampaignEvent) => {
            setEvents((prev) => {
              if (prev.some((e) => e.eventId === event.eventId)) return prev;
              return [...prev, event].sort((a, b) => a.sequence - b.sequence);
            });
          },
          onDone: () => {
            setStatus("ready");
            resolve();
          },
          onError: () => {
            setError("Event stream closed unexpectedly");
            setStatus("ready");
            resolve();
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
      setError(err instanceof Error ? err.message : String(err));
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

  return {
    status,
    error,
    live,
    targets,
    rulePackId,
    campaign,
    events,
    finding,
    replay,
    usage,
    evidence,
    startFaulty,
    requestStop,
    reset,
  };
}
