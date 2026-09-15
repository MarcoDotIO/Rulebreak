/**
 * Machine-readable execution boundaries for Rulebreak V0.
 * Policy source of truth for RB-004; runtime enforcement lands with RB-003+.
 */

export type ExplorerTool =
  | "economy_observe"
  | "trade_create"
  | "trade_accept"
  | "trade_cancel"
  | "strategy_note"
  | "reward_claim";

export type DeniedCapability =
  | "shell_exec"
  | "arbitrary_filesystem"
  | "browser_network"
  | "package_install"
  | "dynamic_plugins"
  | "daemon_control"
  | "operator_http"
  | "target_reset"
  | "target_dispose"
  | "verifier_snapshot"
  | "fixture_select"
  | "evidence_store_mount";

/** P0 tools explorers may use. reward_claim is P1 and must stay disabled for MVP live. */
export const EXPLORER_ALLOWLIST_P0: readonly Exclude<ExplorerTool, "reward_claim">[] = [
  "economy_observe",
  "trade_create",
  "trade_accept",
  "trade_cancel",
  "strategy_note",
] as const;

export const EXPLORER_P1_TOOLS: readonly Extract<ExplorerTool, "reward_claim">[] = [
  "reward_claim",
] as const;

export const EXPLORER_DENIED_CAPABILITIES: readonly DeniedCapability[] = [
  "shell_exec",
  "arbitrary_filesystem",
  "browser_network",
  "package_install",
  "dynamic_plugins",
  "daemon_control",
  "operator_http",
  "target_reset",
  "target_dispose",
  "verifier_snapshot",
  "fixture_select",
  "evidence_store_mount",
] as const;

/** Fields agents may attempt to spoof; bridge must ignore/reject as authority. */
export const REJECTED_AUTHORITY_FIELDS = [
  "actorId",
  "campaignId",
  "capabilityToken",
  "targetUrl",
  "filePath",
  "fixtureMode",
] as const;

export type ActorRole = "operator" | "coordinator" | "explorer_a" | "explorer_b" | "verifier" | "target";

export function isExplorerToolAllowedP0(tool: string): boolean {
  return (EXPLORER_ALLOWLIST_P0 as readonly string[]).includes(tool);
}

export function isDeniedCapability(name: string): boolean {
  return (EXPLORER_DENIED_CAPABILITIES as readonly string[]).includes(name);
}

export function isRejectedAuthorityField(field: string): boolean {
  return (REJECTED_AUTHORITY_FIELDS as readonly string[]).includes(field);
}

/** Live spend remains off until the live-acceptance gate is evidenced. */
export const LIVE_DEFAULT_ENABLED = false;

export const LIVE_GATE_DOC = "docs/security/live-acceptance-gate.md";
export const THREAT_MODEL_DOC = "docs/threat-model.md";
