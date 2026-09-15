import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

export const OPERATOR_TOKEN_HEADER = "x-rulebreak-operator-token";

export function configuredOperatorToken(): string | null {
  const raw = process.env.RULEBREAK_OPERATOR_TOKEN;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Enforce operator token on control-plane mutations (G4-P5).
 * Missing/empty RULEBREAK_OPERATOR_TOKEN → 503 (mutations unavailable).
 * Wrong/missing header → 401.
 */
export async function requireOperator(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const expected = configuredOperatorToken();
  if (!expected) {
    await reply.code(503).send({
      error: "operator token not configured",
      hint: "Set RULEBREAK_OPERATOR_TOKEN for control API mutations",
    });
    return;
  }

  const providedRaw = request.headers[OPERATOR_TOKEN_HEADER];
  const provided = Array.isArray(providedRaw) ? providedRaw[0] : providedRaw;
  if (typeof provided !== "string" || !safeEqual(provided.trim(), expected)) {
    await reply.code(401).send({ error: "unauthorized operator" });
  }
}
