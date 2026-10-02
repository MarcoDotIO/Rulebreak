import type { UsageLedger } from "@rulebreak/contracts";

/**
 * RB-023: usage line copy. A field the server left out reads "not reported"
 * on its own; it is never shown as 0. A real 0 still reads 0. No usage at all
 * (e.g. after a start_error POST) reads "Usage not reported".
 */
export const USAGE_NOT_REPORTED = "Usage not reported";

function count(n: number | undefined, one: string, many: string): string {
  if (n === undefined || n === null) return `${many} not reported`;
  return `${n} ${n === 1 ? one : many}`;
}

export function formatUsage(usage: Partial<UsageLedger> | null | undefined): string {
  if (!usage) return USAGE_NOT_REPORTED;
  const cost =
    usage.costUsd === undefined || usage.costUsd === null ? "cost not reported" : `$${usage.costUsd}`;
  return `Usage: ${[
    count(usage.toolCalls, "tool call", "tool calls"),
    count(usage.mutations, "mutation", "mutations"),
    count(usage.tokens, "token", "tokens"),
    cost,
  ].join(", ")}`;
}
