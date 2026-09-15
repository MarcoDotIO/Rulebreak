import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import {
  ScriptedCampaignRunner,
  knownTradeFailureSteps,
} from "@rulebreak/campaign";
import type {
  Campaign,
  CampaignEvent,
  Finding,
  ReplayResult,
  UsageLedger,
  WorldState,
} from "@rulebreak/contracts";
import {
  exportEvidenceBundle,
  loadBundleFromStore,
  replayBundle,
} from "@rulebreak/replay";

const HOST = process.env.RULEBREAK_HOST ?? "127.0.0.1";
const PORT = Number(process.env.RULEBREAK_PORT ?? 4100);
const DATA_DIR = process.env.RULEBREAK_DATA_DIR ?? ".rulebreak";

mkdirSync(join(DATA_DIR, "campaigns"), { recursive: true });
mkdirSync(join(DATA_DIR, "exports"), { recursive: true });

type CampaignSession = {
  runner: ScriptedCampaignRunner;
  campaign: Campaign;
  events: CampaignEvent[];
  finding: Finding | null;
  replay: ReplayResult | null;
  initialWorld: WorldState | null;
  finalWorld: WorldState | null;
  exportDir: string | null;
};

const sessions = new Map<string, CampaignSession>();

function usageFor(session: CampaignSession): UsageLedger {
  const actions = session.runner.store.listActions(session.campaign.campaignId);
  const mutations = actions.filter((row) => {
    try {
      const result = JSON.parse(row.resultJson) as { outcome?: string };
      return result.outcome === "accepted";
    } catch {
      return false;
    }
  }).length;
  return {
    schemaVersion: 1,
    campaignId: session.campaign.campaignId,
    toolCalls: actions.length,
    mutations,
    tokens: 0,
    costUsd: 0,
  };
}

function evidenceSummary(session: CampaignSession) {
  const before = session.initialWorld;
  const after = session.finalWorld;
  if (!before || !after) return null;
  const playerIds = [
    ...new Set([
      ...(Object.keys(before.balances) as Array<keyof typeof before.balances>),
      ...(Object.keys(after.balances) as Array<keyof typeof after.balances>),
    ]),
  ];
  const rows: Record<string, { before: string; after: string }> = {};
  const fmtItems = (world: WorldState, playerId: string) => {
    const items = world.itemOccurrences
      .filter(
        (occ) =>
          occ.location.kind === "player" && occ.location.playerId === playerId,
      )
      .map((occ) => occ.itemId);
    return items.length ? items.join(",") : "[]";
  };
  for (const playerId of playerIds) {
    rows[`${String(playerId)}.currency`] = {
      before: String(before.balances[playerId] ?? "—"),
      after: String(after.balances[playerId] ?? "—"),
    };
    rows[`${String(playerId)}.inventory`] = {
      before: fmtItems(before, String(playerId)),
      after: fmtItems(after, String(playerId)),
    };
  }
  return rows;
}

const app = Fastify({ logger: false });

app.addHook("onRequest", async (request, reply) => {
  const origin = request.headers.origin ?? "http://127.0.0.1:5173";
  reply.header("Access-Control-Allow-Origin", origin);
  reply.header(
    "Access-Control-Allow-Headers",
    "content-type, x-rulebreak-operator-token",
  );
  reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (request.method === "OPTIONS") {
    return reply.code(204).send();
  }
});

app.get("/api/health", async () => ({
  ok: true,
  mode: "scripted",
  service: "rulebreak-control",
}));

app.get("/api/targets", async () => ({
  targets: [
    {
      schemaVersion: 1,
      targetId: "synthetic-trade-faulty",
      displayName: "Synthetic trade (faulty fixture)",
      fixtureMode: "faulty",
      buildId: "local-dev",
      publicContractVersion: 1,
    },
    {
      schemaVersion: 1,
      targetId: "synthetic-trade-fixed",
      displayName: "Synthetic trade (fixed)",
      fixtureMode: "fixed",
      buildId: "local-dev",
      publicContractVersion: 1,
    },
  ],
  rulePacks: [{ rulePackId: "rulebreak-trade-v1", version: "1.0.0" }],
}));

app.post<{
  Body: { fixtureMode?: "fixed" | "faulty"; campaignId?: string };
}>("/api/campaigns", async (request, reply) => {
  const fixtureMode = request.body?.fixtureMode ?? "faulty";
  const campaignId =
    request.body?.campaignId?.trim() ||
    `camp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  if (sessions.has(campaignId)) {
    return reply.code(409).send({ error: "campaign exists" });
  }

  const dbPath = join(DATA_DIR, "campaigns", `${campaignId}.sqlite`);
  const runner = new ScriptedCampaignRunner({
    campaignId,
    dbPath,
    fixtureMode,
    steps: knownTradeFailureSteps(),
  });
  const result = runner.run();
  const events = runner.store.listEvents(campaignId);
  const campaign = runner.store.getCampaign(campaignId) ?? result.campaign;
  const initialWorld = runner.store.getInitialWorld(campaignId);
  const actions = runner.store.listActions(campaignId);
  const last = actions[actions.length - 1];
  const finalWorld = last
    ? (JSON.parse(last.worldJson) as WorldState)
    : initialWorld;

  let replay: ReplayResult | null = null;
  let exportDir: string | null = null;
  if (result.finding) {
    const bundle = loadBundleFromStore(runner.store, campaignId);
    // Control replay: fixed target should block the duplicate-item path.
    replay = replayBundle(bundle, { fixtureMode: "fixed" });
    exportDir = join(DATA_DIR, "exports", campaignId);
    exportEvidenceBundle(bundle, exportDir);

    const replayEvent: CampaignEvent = {
      schemaVersion: 1,
      eventId: `event-${campaignId}-replay`,
      campaignId,
      sequence: events.length + 1,
      timestamp: new Date().toISOString(),
      mode: "recorded",
      type: "replay_result",
      payload: replay,
    };
    events.push(replayEvent);
  }

  const session: CampaignSession = {
    runner,
    campaign,
    events,
    finding: result.finding,
    replay,
    initialWorld,
    finalWorld,
    exportDir,
  };
  sessions.set(campaignId, session);

  return {
    campaign,
    finding: result.finding,
    replay,
    outcome: result.outcome,
    usage: usageFor(session),
    eventCount: events.length,
  };
});

app.get<{ Params: { id: string } }>("/api/campaigns/:id", async (request, reply) => {
  const session = sessions.get(request.params.id);
  if (!session) {
    return reply.code(404).send({ error: "campaign not found in memory" });
  }
  return {
    campaign: session.campaign,
    finding: session.finding,
    replay: session.replay,
    usage: usageFor(session),
    eventCount: session.events.length,
  };
});

app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
  "/api/campaigns/:id/events",
  async (request, reply) => {
    const session = sessions.get(request.params.id);
    if (!session) {
      return reply.code(404).send({ error: "campaign not found" });
    }
    const after = Number(request.query.after ?? 0);
    const origin = request.headers.origin ?? "http://127.0.0.1:5173";
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": origin,
    });

    const send = (event: CampaignEvent) => {
      reply.raw.write(`id: ${event.sequence}\n`);
      reply.raw.write(`event: campaign\n`);
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    for (const event of session.events) {
      if (event.sequence > after) send(event);
    }
    reply.raw.write(
      `event: done\ndata: ${JSON.stringify({ ok: true, campaignId: session.campaign.campaignId })}\n\n`,
    );
    reply.raw.end();
  },
);

app.get<{ Params: { id: string } }>("/api/findings/:id", async (request, reply) => {
  for (const session of sessions.values()) {
    if (session.finding?.findingId === request.params.id) {
      return {
        finding: session.finding,
        replay: session.replay,
        campaign: session.campaign,
        evidence: evidenceSummary(session),
        exportDir: session.exportDir,
      };
    }
  }
  return reply.code(404).send({ error: "finding not found" });
});

app.post<{ Params: { id: string } }>(
  "/api/campaigns/:id/stop",
  async (request, reply) => {
    const session = sessions.get(request.params.id);
    if (!session) return reply.code(404).send({ error: "campaign not found" });
    if (!session.campaign.stopRequested && session.campaign.status === "running") {
      try {
        session.runner.requestStop();
      } catch {
        // already terminal
      }
    }
    session.campaign =
      session.runner.store.getCampaign(request.params.id) ?? {
        ...session.campaign,
        stopRequested: true,
        status: "stopped",
      };
    return { campaign: session.campaign };
  },
);

await app.listen({ host: HOST, port: PORT });
console.log(`rulebreak server listening on http://${HOST}:${PORT}`);
