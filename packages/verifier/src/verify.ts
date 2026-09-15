import {
  ActionEnvelopeSchema,
  ActionResultSchema,
  APPROVED_RULE_PACK_V1,
  InvariantViolationSchema,
  type ActionEnvelope,
  type ActionResult,
  type InvariantViolation,
  type RulePack,
  type WorldState,
} from "@rulebreak/contracts";
import { hashWorldState } from "./hash.js";
import { evaluateTransitionInvariants, type PredicateFailure } from "./predicates.js";

export type VerificationInput = {
  preState: WorldState;
  envelope: ActionEnvelope;
  result: ActionResult;
  postState: WorldState;
  rulePack?: RulePack;
};

export type VerificationOk = {
  ok: true;
  preStateHash: string;
  postStateHash: string;
};

export type VerificationFail = {
  ok: false;
  preStateHash: string;
  postStateHash: string;
  violations: InvariantViolation[];
};

export type VerificationOutcome = VerificationOk | VerificationFail;

export function verifyTransition(input: VerificationInput): VerificationOutcome {
  const envelope = ActionEnvelopeSchema.parse(input.envelope);
  const result = ActionResultSchema.parse(input.result);
  const rulePack = input.rulePack ?? APPROVED_RULE_PACK_V1;
  const preStateHash = hashWorldState(input.preState);
  const postStateHash = hashWorldState(input.postState);
  const failures = evaluateTransitionInvariants(
    input.preState,
    envelope,
    result,
    input.postState,
    rulePack,
  );
  if (failures.length === 0) {
    return { ok: true, preStateHash, postStateHash };
  }
  const violations = failures.map((failure: PredicateFailure, index) =>
    InvariantViolationSchema.parse({
      schemaVersion: 1,
      invariantId: failure.invariantId,
      logicalActionId: envelope.logicalActionId,
      sequence: result.sequence ?? index,
      message: failure.message,
      preStateHash,
      postStateHash,
    }),
  );
  return { ok: false, preStateHash, postStateHash, violations };
}
