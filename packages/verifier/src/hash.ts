import { createHash } from "node:crypto";
import type { WorldState } from "@rulebreak/contracts";

/** Deterministic domain hash: sorted object keys, array order preserved. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortValue);
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const out: Record<string, unknown> = {};
  for (const [key, child] of entries) out[key] = sortValue(child);
  return out;
}

export function hashWorldState(world: WorldState): string {
  return createHash("sha256").update(canonicalJson(world)).digest("hex").slice(0, 32);
}
