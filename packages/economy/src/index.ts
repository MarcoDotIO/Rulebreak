import {
  ActionEnvelopeSchema,
  DEFAULT_INITIAL_WORLD,
  InitialWorldSchema,
  MAX_CURRENCY,
  PlayerIdSchema,
  TradeCreateParamsSchema,
  TradeAcceptParamsSchema,
  TradeCancelParamsSchema,
  WorldStateSchema,
  type ActionEnvelope,
  type ActionResult,
  type InitialWorld,
  type ItemOccurrence,
  type PlayerId,
  type PlayerView,
  type TradeRecord,
  type WorldState,
} from "@rulebreak/contracts";

const MAX_ACTIONS = 1_000_000;

type DomainInspection = {
  view: PlayerView;
  publicTrades: TradeRecord[];
  virtualClock: number;
};

export type TargetExecution = {
  result: ActionResult;
  preState: WorldState;
  postState: WorldState;
};

/** Public target surface available to an actor-bound bridge. */
export interface ActorTargetAdapter {
  execute(envelope: unknown): TargetExecution;
  inspectForActor(actorId: PlayerId): DomainInspection;
}

/** Coordinator/replay surface. Actor bridges never receive this object. */
export interface CoordinatorTargetAdapter extends ActorTargetAdapter {
  initialize(initialWorld?: InitialWorld): WorldState;
  snapshotForVerifier(): WorldState;
  dispose(): void;
}

export type FixedTargetAdapter = CoordinatorTargetAdapter;

class TradeEconomy implements CoordinatorTargetAdapter {
  private state: WorldState;
  private actionSequence = 0;
  private disposed = false;
  private readonly faulty: boolean;

  public constructor(faulty: boolean, initialWorld: InitialWorld = DEFAULT_INITIAL_WORLD) {
    this.faulty = faulty;
    this.state = this.buildInitialState(initialWorld);
  }

  public initialize(initialWorld: InitialWorld = DEFAULT_INITIAL_WORLD): WorldState {
    this.assertNotDisposed();
    this.state = this.buildInitialState(initialWorld);
    this.actionSequence = 0;
    return cloneState(this.state);
  }

  public execute(input: unknown): TargetExecution {
    const preState = cloneState(this.state);
    const parsed = ActionEnvelopeSchema.safeParse(input);
    if (!parsed.success) {
      return this.invalidExecution(preState, readIdentity(input));
    }
    const envelope = parsed.data;
    if (this.disposed) {
      return this.rejectedExecution(preState, envelope, "TARGET_DISPOSED", "target is disposed");
    }
    if (this.actionSequence >= MAX_ACTIONS) {
      return this.rejectedExecution(preState, envelope, "ACTION_LIMIT", "action limit exceeded");
    }

    this.actionSequence += 1;
    let result: ActionResult;
    switch (envelope.kind) {
      case "trade_create":
        result = this.create(envelope);
        break;
      case "trade_accept":
        result = this.accept(envelope);
        break;
      case "trade_cancel":
        result = this.cancel(envelope);
        break;
      case "economy_observe":
      case "strategy_note":
        result = this.rejectedExecution(this.state, envelope, "UNSUPPORTED_MUTATION", "non-domain actions are handled by the bridge").result;
        break;
    }
    if (result.outcome === "accepted") {
      this.state = { ...this.state, virtualClock: this.state.virtualClock + 1 };
    }
    return { result, preState, postState: cloneState(this.state) };
  }

  public inspectForActor(actorId: PlayerId): DomainInspection {
    this.assertNotDisposed();
    const player = PlayerIdSchema.parse(actorId);
    const balance = this.state.balances[player];
    const inventoryItemIds = this.state.itemOccurrences
      .filter((occurrence) => occurrence.location.kind === "player" && occurrence.location.playerId === player)
      .map((occurrence) => occurrence.itemId);
    return {
      view: { playerId: player, currency: balance ?? 0, inventoryItemIds },
      publicTrades: this.state.trades.map((trade) => ({ ...trade })),
      virtualClock: this.state.virtualClock,
    };
  }

  public snapshotForVerifier(): WorldState {
    this.assertNotDisposed();
    return cloneState(this.state);
  }

  public dispose(): void {
    this.disposed = true;
  }

  private buildInitialState(initialWorld: InitialWorld): WorldState {
    const world = InitialWorldSchema.parse(initialWorld);
    const [playerA, playerB] = world.players;
    return WorldStateSchema.parse({
      schemaVersion: 1,
      balances: { [playerA]: world.startingCurrency, [playerB]: world.startingCurrency },
      itemOccurrences: [{ itemId: world.uniqueItemId, location: { kind: "player", playerId: world.ownerId } }],
      trades: [],
      nextTradeSeq: 0,
      virtualClock: 0,
      seed: world.seed,
    });
  }

  private create(envelope: ActionEnvelope): ActionResult {
    const params = TradeCreateParamsSchema.parse(envelope.params);
    const seller = envelope.actorId;
    if (params.counterpartyId === seller) return this.domainRejected(envelope, "SELF_TRADE", "counterparty must differ from seller");
    const occurrenceIndex = this.state.itemOccurrences.findIndex(
      (occurrence) => occurrence.itemId === params.itemId && occurrence.location.kind === "player" && occurrence.location.playerId === seller,
    );
    if (occurrenceIndex < 0) return this.domainRejected(envelope, "ITEM_NOT_OWNED", "seller does not own the item");
    if (this.state.itemOccurrences.some((occurrence) => occurrence.itemId === params.itemId && occurrence.location.kind === "escrow")) {
      return this.domainRejected(envelope, "ITEM_IN_ESCROW", "item is already escrowed");
    }
    const tradeId = `trade-${String(this.state.nextTradeSeq + 1).padStart(4, "0")}`;
    const itemOccurrences = this.state.itemOccurrences.map((occurrence, index) =>
      index === occurrenceIndex ? { itemId: params.itemId, location: { kind: "escrow" as const, tradeId } } : occurrence,
    );
    const trade: TradeRecord = { tradeId, sellerId: seller, buyerId: params.counterpartyId, itemId: params.itemId, price: params.price, status: "open" };
    this.state = { ...this.state, itemOccurrences, trades: [...this.state.trades, trade], nextTradeSeq: this.state.nextTradeSeq + 1 };
    return this.accepted(envelope, "TRADE_CREATED", tradeId);
  }

  private accept(envelope: ActionEnvelope): ActionResult {
    const params = TradeAcceptParamsSchema.parse(envelope.params);
    const index = this.state.trades.findIndex((trade) => trade.tradeId === params.tradeId);
    if (index < 0) return this.domainRejected(envelope, "TRADE_NOT_FOUND", "trade does not exist");
    const trade = this.state.trades[index];
    if (trade === undefined || trade.status !== "open") return this.domainRejected(envelope, "TRADE_NOT_OPEN", "trade is not open");
    if (envelope.actorId !== trade.buyerId) return this.domainRejected(envelope, "NOT_COUNTERPARTY", "only the buyer may accept");
    const buyerBalance = this.state.balances[trade.buyerId] ?? 0;
    const sellerBalance = this.state.balances[trade.sellerId] ?? 0;
    if (buyerBalance < trade.price) return this.domainRejected(envelope, "INSUFFICIENT_FUNDS", "buyer cannot afford the price");
    if (sellerBalance > MAX_CURRENCY - trade.price) return this.domainRejected(envelope, "CURRENCY_OVERFLOW", "seller balance would exceed the currency bound");
    const escrowIndex = this.state.itemOccurrences.findIndex(
      (occurrence) => occurrence.itemId === trade.itemId && occurrence.location.kind === "escrow" && occurrence.location.tradeId === trade.tradeId,
    );
    if (escrowIndex < 0) return this.domainRejected(envelope, "ESCROW_MISSING", "trade escrow is missing");
    const balances = {
      ...this.state.balances,
      [trade.sellerId]: sellerBalance + trade.price,
      [trade.buyerId]: buyerBalance - trade.price,
    };
    const itemOccurrences = this.state.itemOccurrences.map((occurrence, occurrenceIndex) =>
      occurrenceIndex === escrowIndex ? { itemId: trade.itemId, location: { kind: "player" as const, playerId: trade.buyerId } } : occurrence,
    );
    const trades = this.state.trades.map((entry, tradeIndex) => tradeIndex === index ? { ...entry, status: "accepted" as const } : entry);
    this.state = { ...this.state, balances, itemOccurrences, trades };
    return this.accepted(envelope, "TRADE_ACCEPTED", trade.tradeId);
  }

  private cancel(envelope: ActionEnvelope): ActionResult {
    const params = TradeCancelParamsSchema.parse(envelope.params);
    const index = this.state.trades.findIndex((trade) => trade.tradeId === params.tradeId);
    if (index < 0) return this.domainRejected(envelope, "TRADE_NOT_FOUND", "trade does not exist");
    const trade = this.state.trades[index];
    if (trade === undefined) return this.domainRejected(envelope, "TRADE_NOT_FOUND", "trade does not exist");
    if (envelope.actorId !== trade.sellerId) return this.domainRejected(envelope, "NOT_SELLER", "only the seller may cancel");
    if (trade.status !== "open" && !this.faulty) return this.domainRejected(envelope, "TRADE_NOT_OPEN", "only open trades may be cancelled");
    if (trade.status !== "open" && this.faulty) {
      // Deliberate RB-006 fixture defect: return a second occurrence after acceptance.
      const itemOccurrences = [...this.state.itemOccurrences, { itemId: trade.itemId, location: { kind: "player" as const, playerId: trade.sellerId } }];
      const trades = this.state.trades.map((entry, tradeIndex) => tradeIndex === index ? { ...entry, status: "cancelled" as const } : entry);
      this.state = { ...this.state, itemOccurrences, trades };
      return this.accepted(envelope, "FAULTY_ACCEPT_AFTER_COMPLETION", trade.tradeId);
    }
    const escrowIndex = this.state.itemOccurrences.findIndex(
      (occurrence) => occurrence.itemId === trade.itemId && occurrence.location.kind === "escrow" && occurrence.location.tradeId === trade.tradeId,
    );
    if (escrowIndex < 0) return this.domainRejected(envelope, "ESCROW_MISSING", "trade escrow is missing");
    const itemOccurrences = this.state.itemOccurrences.map((occurrence, occurrenceIndex) =>
      occurrenceIndex === escrowIndex ? { itemId: trade.itemId, location: { kind: "player" as const, playerId: trade.sellerId } } : occurrence,
    );
    const trades = this.state.trades.map((entry, tradeIndex) => tradeIndex === index ? { ...entry, status: "cancelled" as const } : entry);
    this.state = { ...this.state, itemOccurrences, trades };
    return this.accepted(envelope, "TRADE_CANCELLED", trade.tradeId);
  }

  private accepted(envelope: ActionEnvelope, domainCode: string, message: string): ActionResult {
    return { schemaVersion: 1, logicalActionId: envelope.logicalActionId, transportDispatchId: envelope.transportDispatchId, outcome: "accepted", domainCode, message, sequence: this.actionSequence };
  }

  private domainRejected(envelope: ActionEnvelope, domainCode: string, message: string): ActionResult {
    return { schemaVersion: 1, logicalActionId: envelope.logicalActionId, transportDispatchId: envelope.transportDispatchId, outcome: "domain_rejected", domainCode, message, sequence: this.actionSequence };
  }

  private rejectedExecution(preState: WorldState, envelope: ActionEnvelope, domainCode: string, message: string): TargetExecution {
    return { result: this.domainRejected(envelope, domainCode, message), preState, postState: cloneState(this.state) };
  }

  private invalidExecution(preState: WorldState, identity: { logicalActionId: string; transportDispatchId: string }): TargetExecution {
    const result: ActionResult = { schemaVersion: 1, logicalActionId: identity.logicalActionId, transportDispatchId: identity.transportDispatchId, outcome: "target_error", domainCode: "INVALID_ENVELOPE", message: "invalid action envelope" };
    return { result, preState, postState: cloneState(this.state) };
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error("target is disposed");
  }
}

/** Fixed is the only default construction path. */
export function createTargetAdapter(): FixedTargetAdapter {
  return new TradeEconomy(false);
}

export function createFixedTargetAdapter(): FixedTargetAdapter {
  return createTargetAdapter();
}

/** Trusted fixture construction for tests/replay only; never part of explorer arguments. */
export function createFaultyFixtureTargetAdapter(): CoordinatorTargetAdapter {
  return new TradeEconomy(true);
}

/** Bind the coordinator-created target to one actor without privileged methods. */
export function bindActor(adapter: CoordinatorTargetAdapter, actorId: PlayerId): ActorTargetAdapter {
  PlayerIdSchema.parse(actorId);
  return {
    execute: (envelope) => adapter.execute(envelope),
    inspectForActor: (boundActor) => {
      if (boundActor !== actorId) throw new Error("actor binding mismatch");
      return adapter.inspectForActor(actorId);
    },
  };
}

function cloneState(state: WorldState): WorldState {
  return structuredClone(state);
}

function readIdentity(input: unknown): { logicalActionId: string; transportDispatchId: string } {
  if (typeof input === "object" && input !== null) {
    const record = input as Record<string, unknown>;
    return {
      logicalActionId: typeof record.logicalActionId === "string" && record.logicalActionId.length > 0 ? record.logicalActionId : "invalid-action",
      transportDispatchId: typeof record.transportDispatchId === "string" && record.transportDispatchId.length > 0 ? record.transportDispatchId : "invalid-dispatch",
    };
  }
  return { logicalActionId: "invalid-action", transportDispatchId: "invalid-dispatch" };
}

export type { DomainInspection, ItemOccurrence };
