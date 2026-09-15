import {
  CampaignSchema,
  type ActionEnvelope,
  type Campaign,
  type CampaignEvent,
  type Finding,
  type InvariantViolation,
  type PlayerId,
} from "@rulebreak/contracts";
import {
  createFaultyFixtureTargetAdapter,
  createFixedTargetAdapter,
  type CoordinatorTargetAdapter,
} from "@rulebreak/economy";
import { EvidenceStore } from "@rulebreak/evidence";
import { hashWorldState, verifyTransition } from "@rulebreak/verifier";

export type ScriptedStep = {
  actorId: PlayerId;
  kind: "trade_create" | "trade_accept" | "trade_cancel";
  params: Record<string, unknown>;
};

export type ScriptedRunOptions = {
  campaignId: string;
  dbPath: string;
  fixtureMode: "fixed" | "faulty";
  steps: ScriptedStep[];
  /** When true, refuse new admissions after this many accepted mutations. */
  maxMutations?: number;
  stopAfterSequence?: number;
};

export type ScriptedRunResult = {
  campaign: Campaign;
  outcome:
    | "violation_candidate"
    | "no_violation_observed"
    | "stopped"
    | "error";
  finding: Finding | null;
  actionCount: number;
  eventCount: number;
};

const KNOWN_FAILURE_STEPS: ScriptedStep[] = [
  {
    actorId: "player-a",
    kind: "trade_create",
    params: { itemId: "relic-001", counterpartyId: "player-b", price: 25 },
  },
  {
    actorId: "player-b",
    kind: "trade_accept",
    params: { tradeId: "trade-0001" },
  },
  {
    actorId: "player-a",
    kind: "trade_cancel",
    params: { tradeId: "trade-0001" },
  },
];

export function knownTradeFailureSteps(): ScriptedStep[] {
  return KNOWN_FAILURE_STEPS.map((step) => ({ ...step, params: { ...step.params } }));
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeEnvelope(
  campaignId: string,
  step: ScriptedStep,
  n: number,
  dispatchId?: string,
): ActionEnvelope {
  return {
    schemaVersion: 1,
    campaignId,
    worldId: `world-${campaignId}`,
    actorId: step.actorId,
    logicalActionId: `action-${n}`,
    transportDispatchId: dispatchId ?? `dispatch-${n}`,
    kind: step.kind,
    params: step.params,
  };
}

export class ScriptedCampaignRunner {
  #store: EvidenceStore;
  #target: CoordinatorTargetAdapter;
  #campaign: Campaign;
  #sequence = 0;
  #eventSequence = 0;
  #mutationCount = 0;
  #stopped = false;
  #frozen = false;

  constructor(
    private readonly options: ScriptedRunOptions,
    store?: EvidenceStore,
    target?: CoordinatorTargetAdapter,
  ) {
    this.#store = store ?? new EvidenceStore(options.dbPath);
    this.#target =
      target ??
      (options.fixtureMode === "faulty"
        ? createFaultyFixtureTargetAdapter()
        : createFixedTargetAdapter());
    this.#campaign = CampaignSchema.parse({
      schemaVersion: 1,
      campaignId: options.campaignId,
      status: "running",
      mode: "scripted",
      targetId:
        options.fixtureMode === "faulty"
          ? "synthetic-trade-faulty"
          : "synthetic-trade-fixed",
      rulePackId: "rulebreak-trade-v1",
      createdAt: nowIso(),
      stopRequested: false,
    });
    this.#store.createCampaign(this.#campaign);
    this.#appendCampaignState("running");
  }

  get store(): EvidenceStore {
    return this.#store;
  }

  requestStop(): void {
    this.#stopped = true;
    this.#campaign = {
      ...this.#campaign,
      stopRequested: true,
      status: "stopped",
    };
    this.#store.updateCampaign(this.#campaign, "stopped");
    this.#appendCampaignState("stopped", true);
  }

  /**
   * Submit one trusted envelope. Dispatch dedupe returns the persisted result.
   */
  submit(envelope: ActionEnvelope): {
    result: import("@rulebreak/contracts").ActionResult;
    deduped: boolean;
    verificationOk: boolean;
    violations: InvariantViolation[];
  } {
    if (this.#stopped || this.#frozen || this.#campaign.stopRequested) {
      throw new Error("campaign is not admitting new actions");
    }
    if (
      this.options.maxMutations !== undefined &&
      this.#mutationCount >= this.options.maxMutations
    ) {
      throw new Error("mutation budget exhausted");
    }

    const existing = this.#store.findActionByDispatch(
      this.#campaign.campaignId,
      envelope.transportDispatchId,
    );
    if (existing) {
      if (existing.envelopeJson !== JSON.stringify(envelope)) {
        throw new Error(
          `dispatch id reused with different payload: ${envelope.transportDispatchId}`,
        );
      }
      return {
        result: JSON.parse(existing.resultJson),
        deduped: true,
        verificationOk: true,
        violations: [],
      };
    }

    this.#sequence += 1;
    const submitted = this.#nextEvent({
      type: "action_submitted",
      payload: {
        logicalActionId: envelope.logicalActionId,
        kind: envelope.kind,
        actorId: envelope.actorId,
      },
    });
    this.#store.appendEvent(submitted);

    const execution = this.#target.execute(envelope);
    if (execution.result.outcome === "accepted") {
      this.#mutationCount += 1;
    }
    const verification = verifyTransition({
      preState: execution.preState,
      envelope,
      result: execution.result,
      postState: execution.postState,
    });

    const completed = this.#nextEvent({
      type: "action_completed",
      payload: execution.result,
    });

    const persistStatus = this.#store.persistAcceptedAction({
      campaignId: this.#campaign.campaignId,
      sequence: this.#sequence,
      envelope,
      result: execution.result,
      preStateHash: verification.preStateHash,
      postStateHash: verification.postStateHash,
      world: execution.postState,
      event: completed,
    });
    if (persistStatus === "duplicate") {
      return {
        result: execution.result,
        deduped: true,
        verificationOk: verification.ok,
        violations: verification.ok ? [] : verification.violations,
      };
    }

    if (!verification.ok) {
      this.#frozen = true;
      const violation = verification.violations[0]!;
      const finding: Finding = {
        schemaVersion: 1,
        findingId: `finding-${this.#campaign.campaignId}`,
        campaignId: this.#campaign.campaignId,
        status: "candidate",
        mode: "scripted",
        violation,
        targetId: this.#campaign.targetId,
        rulePackVersion: "1.0.0",
      };
      this.#store.saveFinding(finding, violation);
      this.#store.appendEvent(
        this.#nextEvent({ type: "rule_violation", payload: violation }),
      );
      this.#campaign = { ...this.#campaign, status: "completed" };
      this.#store.updateCampaign(this.#campaign, "violation_candidate");
      this.#appendCampaignState("completed");
      return {
        result: execution.result,
        deduped: false,
        verificationOk: false,
        violations: verification.violations,
      };
    }

    return {
      result: execution.result,
      deduped: false,
      verificationOk: true,
      violations: [],
    };
  }

  run(): ScriptedRunResult {
    let outcome: ScriptedRunResult["outcome"] = "no_violation_observed";
    let finding: Finding | null = null;

    for (let i = 0; i < this.options.steps.length; i += 1) {
      if (this.#stopped || this.#campaign.stopRequested) {
        outcome = "stopped";
        break;
      }
      if (
        this.options.stopAfterSequence !== undefined &&
        i >= this.options.stopAfterSequence
      ) {
        this.requestStop();
        outcome = "stopped";
        break;
      }
      if (this.#frozen) {
        outcome = "violation_candidate";
        break;
      }

      const step = this.options.steps[i]!;
      const envelope = makeEnvelope(this.#campaign.campaignId, step, i + 1);
      const submitted = this.submit(envelope);
      if (!submitted.verificationOk) {
        outcome = "violation_candidate";
        finding = this.#store.getFinding(this.#campaign.campaignId);
        break;
      }
    }

    if (!this.#frozen && outcome === "no_violation_observed" && !this.#stopped) {
      this.#campaign = { ...this.#campaign, status: "completed" };
      this.#store.updateCampaign(this.#campaign, "no_violation_observed");
      this.#appendCampaignState("completed");
    }

    finding = finding ?? this.#store.getFinding(this.#campaign.campaignId);
    return {
      campaign: this.#store.getCampaign(this.#campaign.campaignId) ?? this.#campaign,
      outcome,
      finding,
      actionCount: this.#store.listActions(this.#campaign.campaignId).length,
      eventCount: this.#store.listEvents(this.#campaign.campaignId).length,
    };
  }

  /** Replay a dispatch after a lost response — must not re-apply. */
  retryDispatch(envelope: ActionEnvelope) {
    return this.submit(envelope);
  }

  #nextEvent(partial: {
    type: CampaignEvent["type"];
    payload: CampaignEvent["payload"];
  }): CampaignEvent {
    this.#eventSequence += 1;
    return {
      schemaVersion: 1,
      eventId: `event-${this.#campaign.campaignId}-${this.#eventSequence}`,
      campaignId: this.#campaign.campaignId,
      sequence: this.#eventSequence,
      timestamp: nowIso(),
      mode: "scripted",
      type: partial.type,
      payload: partial.payload,
    } as CampaignEvent;
  }

  #appendCampaignState(status: string, stopRequested?: boolean): void {
    this.#store.appendEvent(
      this.#nextEvent({
        type: "campaign_state",
        payload: {
          status,
          ...(stopRequested !== undefined ? { stopRequested } : {}),
        },
      }),
    );
  }
}

export function runKnownFaultyScript(dbPath: string, campaignId: string): ScriptedRunResult {
  const runner = new ScriptedCampaignRunner({
    campaignId,
    dbPath,
    fixtureMode: "faulty",
    steps: knownTradeFailureSteps(),
  });
  return runner.run();
}

export { hashWorldState, makeEnvelope };
