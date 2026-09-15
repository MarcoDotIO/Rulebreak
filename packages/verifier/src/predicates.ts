import {
  APPROVED_RULE_PACK_V1,
  MAX_CURRENCY,
  P0_INVARIANTS,
  WorldStateSchema,
  type ActionEnvelope,
  type ActionResult,
  type InvariantId,
  type RulePack,
  type WorldState,
} from "@rulebreak/contracts";

export type PredicateFailure = {
  invariantId: InvariantId;
  message: string;
};

function isFiniteInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && Number.isFinite(n);
}

/** INV-001: balances and occurrence counts are valid nonnegative bounded integers. */
export function checkInv001(state: WorldState): PredicateFailure | null {
  for (const [playerId, balance] of Object.entries(state.balances)) {
    if (!isFiniteInt(balance) || balance < 0 || balance > MAX_CURRENCY) {
      return {
        invariantId: "INV-001",
        message: `invalid balance for ${playerId}: ${String(balance)}`,
      };
    }
  }
  if (!isFiniteInt(state.nextTradeSeq) || state.nextTradeSeq < 0 || state.nextTradeSeq > MAX_CURRENCY) {
    return { invariantId: "INV-001", message: `invalid nextTradeSeq: ${String(state.nextTradeSeq)}` };
  }
  if (!isFiniteInt(state.virtualClock) || state.virtualClock < 0 || state.virtualClock > MAX_CURRENCY) {
    return { invariantId: "INV-001", message: `invalid virtualClock: ${String(state.virtualClock)}` };
  }
  return null;
}

/** INV-002: total currency is conserved for P0 (no authorized mints/burns). */
export function checkInv002(pre: WorldState, post: WorldState): PredicateFailure | null {
  const sum = (state: WorldState) =>
    Object.values(state.balances).reduce((acc, value) => acc + value, 0);
  const before = sum(pre);
  const after = sum(post);
  if (before !== after) {
    return {
      invariantId: "INV-002",
      message: `currency total changed from ${before} to ${after}`,
    };
  }
  return null;
}

/** INV-003: each unique item id has exactly one live location (player or escrow). */
export function checkInv003(state: WorldState): PredicateFailure | null {
  const counts = new Map<string, number>();
  for (const occurrence of state.itemOccurrences) {
    counts.set(occurrence.itemId, (counts.get(occurrence.itemId) ?? 0) + 1);
  }
  for (const [itemId, count] of counts) {
    if (count !== 1) {
      return {
        invariantId: "INV-003",
        message: `item ${itemId} has ${count} live locations; expected exactly 1`,
      };
    }
  }
  return null;
}

/** INV-004: trade lifecycle is open→accepted or open→cancelled, never both / illegal jumps. */
export function checkInv004(pre: WorldState, post: WorldState): PredicateFailure | null {
  const preById = new Map(pre.trades.map((trade) => [trade.tradeId, trade]));
  for (const trade of post.trades) {
    const previous = preById.get(trade.tradeId);
    if (!previous) {
      if (trade.status !== "open") {
        return {
          invariantId: "INV-004",
          message: `new trade ${trade.tradeId} started as ${trade.status}`,
        };
      }
      continue;
    }
    if (previous.status === trade.status) continue;
    const legal =
      (previous.status === "open" && trade.status === "accepted") ||
      (previous.status === "open" && trade.status === "cancelled");
    if (!legal) {
      return {
        invariantId: "INV-004",
        message: `trade ${trade.tradeId} moved ${previous.status} → ${trade.status}`,
      };
    }
  }
  return null;
}

/**
 * INV-005: accepted trades exchange assets atomically; rejected commands must not change economic state.
 * Domain-rejected / policy / transport / target_error outcomes require identical economic snapshots.
 */
export function checkInv005(
  pre: WorldState,
  envelope: ActionEnvelope,
  result: ActionResult,
  post: WorldState,
): PredicateFailure | null {
  if (result.outcome !== "accepted") {
    const sameBalances = JSON.stringify(pre.balances) === JSON.stringify(post.balances);
    const sameItems = JSON.stringify(pre.itemOccurrences) === JSON.stringify(post.itemOccurrences);
    const sameTrades = JSON.stringify(pre.trades) === JSON.stringify(post.trades);
    if (!sameBalances || !sameItems || !sameTrades) {
      return {
        invariantId: "INV-005",
        message: `non-accepted outcome ${result.outcome} mutated economic state`,
      };
    }
    return null;
  }

  if (envelope.kind === "trade_accept") {
    const tradeId =
      typeof envelope.params === "object" &&
      envelope.params !== null &&
      "tradeId" in envelope.params
        ? String((envelope.params as { tradeId: string }).tradeId)
        : "";
    const preTrade = pre.trades.find((trade) => trade.tradeId === tradeId);
    const postTrade = post.trades.find((trade) => trade.tradeId === tradeId);
    if (!preTrade || preTrade.status !== "open") {
      return { invariantId: "INV-005", message: `accept referenced missing/open trade ${tradeId}` };
    }
    if (!postTrade || postTrade.status !== "accepted") {
      return { invariantId: "INV-005", message: `accept did not mark trade ${tradeId} accepted` };
    }
    const buyerPre = pre.balances[preTrade.buyerId] ?? 0;
    const sellerPre = pre.balances[preTrade.sellerId] ?? 0;
    const buyerPost = post.balances[preTrade.buyerId] ?? 0;
    const sellerPost = post.balances[preTrade.sellerId] ?? 0;
    if (buyerPost !== buyerPre - preTrade.price || sellerPost !== sellerPre + preTrade.price) {
      return {
        invariantId: "INV-005",
        message: `accept did not transfer currency atomically for ${tradeId}`,
      };
    }
    const escrowGone = !post.itemOccurrences.some(
      (occurrence) =>
        occurrence.itemId === preTrade.itemId &&
        occurrence.location.kind === "escrow" &&
        occurrence.location.tradeId === tradeId,
    );
    const buyerHas = post.itemOccurrences.some(
      (occurrence) =>
        occurrence.itemId === preTrade.itemId &&
        occurrence.location.kind === "player" &&
        occurrence.location.playerId === preTrade.buyerId,
    );
    if (!escrowGone || !buyerHas) {
      return {
        invariantId: "INV-005",
        message: `accept did not move item ${preTrade.itemId} from escrow to buyer atomically`,
      };
    }
  }
  return null;
}

export function evaluateStateInvariants(
  state: WorldState,
  rulePack: RulePack = APPROVED_RULE_PACK_V1,
): PredicateFailure[] {
  const failures: PredicateFailure[] = [];
  const enabled = new Set(rulePack.invariantIds);
  const parsed = WorldStateSchema.safeParse(state);
  if (!parsed.success) {
    if (enabled.has("INV-001")) {
      failures.push({
        invariantId: "INV-001",
        message: `world state failed structural/numeric validation: ${parsed.error.message}`,
      });
    }
    return failures;
  }
  const valid = parsed.data;
  if (enabled.has("INV-001")) {
    const failure = checkInv001(valid);
    if (failure) failures.push(failure);
  }
  if (enabled.has("INV-003")) {
    const failure = checkInv003(valid);
    if (failure) failures.push(failure);
  }
  return failures;
}

export function evaluateTransitionInvariants(
  pre: WorldState,
  envelope: ActionEnvelope,
  result: ActionResult,
  post: WorldState,
  rulePack: RulePack = APPROVED_RULE_PACK_V1,
): PredicateFailure[] {
  WorldStateSchema.parse(pre);
  WorldStateSchema.parse(post);
  const failures: PredicateFailure[] = [];
  const enabled = new Set(rulePack.invariantIds.filter((id) => (P0_INVARIANTS as readonly string[]).includes(id)));

  for (const state of [pre, post]) {
    if (enabled.has("INV-001")) {
      const failure = checkInv001(state);
      if (failure) failures.push(failure);
    }
    if (enabled.has("INV-003")) {
      const failure = checkInv003(state);
      if (failure) failures.push(failure);
    }
  }
  if (enabled.has("INV-002")) {
    const failure = checkInv002(pre, post);
    if (failure) failures.push(failure);
  }
  if (enabled.has("INV-004")) {
    const failure = checkInv004(pre, post);
    if (failure) failures.push(failure);
  }
  if (enabled.has("INV-005")) {
    const failure = checkInv005(pre, envelope, result, post);
    if (failure) failures.push(failure);
  }
  return failures;
}
