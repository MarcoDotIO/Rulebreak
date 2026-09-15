import {
  ExplorerToolNameSchema,
  parseExplorerToolArgs,
  PlayerIdSchema,
  type ActionEnvelope,
  type ActionResult,
  type ExplorerToolName,
  type PlayerId,
} from "@rulebreak/contracts";
import {
  bindActor,
  createFaultyFixtureTargetAdapter,
  createFixedTargetAdapter,
  type ActorTargetAdapter,
  type CoordinatorTargetAdapter,
} from "@rulebreak/economy";

export type BoundToolResult =
  | {
      ok: true;
      campaignId: string;
      actorId: PlayerId;
      tool: ExplorerToolName;
      /** Present for economy_observe */
      observation?: ReturnType<ActorTargetAdapter["inspectForActor"]>;
      /** Present for mutating tools */
      execution?: { result: ActionResult };
    }
  | { ok: false; error: string };

/**
 * Coordinator-owned world + per-actor bound explorer sessions.
 * Trusted actorId/campaignId come only from construction — never from tool args.
 */
export class CoordinatorBridge {
  readonly campaignId: string;
  readonly coordinator: CoordinatorTargetAdapter;
  #seq = 0;

  constructor(options: {
    campaignId: string;
    fixtureMode?: "fixed" | "faulty";
  }) {
    this.campaignId = options.campaignId;
    this.coordinator =
      options.fixtureMode === "faulty"
        ? createFaultyFixtureTargetAdapter()
        : createFixedTargetAdapter();
    this.coordinator.initialize();
  }

  bindExplorer(actorId: PlayerId): BoundExplorerSession {
    const player = PlayerIdSchema.parse(actorId);
    return new BoundExplorerSession(
      this,
      bindActor(this.coordinator, player),
      player,
    );
  }

  nextDispatchIds(tool: string): {
    logicalActionId: string;
    transportDispatchId: string;
  } {
    this.#seq += 1;
    return {
      logicalActionId: `bound-${tool}-${this.#seq}`,
      transportDispatchId: `bound-dispatch-${this.campaignId}-${this.#seq}`,
    };
  }
}

export class BoundExplorerSession {
  constructor(
    private readonly bridge: CoordinatorBridge,
    private readonly bound: ActorTargetAdapter,
    readonly actorId: PlayerId,
  ) {}

  /**
   * Scripted worker path: explorer args → authority reject → inject binding → domain.
   */
  callTool(toolName: string, rawArgs: unknown = {}): BoundToolResult {
    const toolParsed = ExplorerToolNameSchema.safeParse(toolName);
    if (!toolParsed.success) {
      return { ok: false, error: `unknown tool: ${toolName}` };
    }
    const tool = toolParsed.data;
    const parsed = parseExplorerToolArgs(tool, rawArgs ?? {});
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }

    if (tool === "economy_observe") {
      const observation = this.bound.inspectForActor(this.actorId);
      return {
        ok: true,
        campaignId: this.bridge.campaignId,
        actorId: this.actorId,
        tool,
        observation,
      };
    }

    if (tool === "strategy_note") {
      // Non-mutating shared note — accepted as bound acknowledgment only.
      return {
        ok: true,
        campaignId: this.bridge.campaignId,
        actorId: this.actorId,
        tool,
      };
    }

    const ids = this.bridge.nextDispatchIds(tool);
    const envelope = {
      schemaVersion: 1 as const,
      campaignId: this.bridge.campaignId,
      worldId: `world-${this.bridge.campaignId}`,
      actorId: this.actorId,
      logicalActionId: ids.logicalActionId,
      transportDispatchId: ids.transportDispatchId,
      kind: tool,
      params: parsed.params,
    } satisfies ActionEnvelope;

    const execution = this.bound.execute(envelope);
    return {
      ok: true,
      campaignId: this.bridge.campaignId,
      actorId: this.actorId,
      tool,
      execution: { result: execution.result },
    };
  }
}
