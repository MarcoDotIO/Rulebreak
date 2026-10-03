import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

export const OPERATOR_TOKEN_HEADER = "x-rulebreak-operator-token";

/**
 * Typed codes on the two operator rejections (RB-026). Clients branch on `code` only;
 * `error` and `hint` are fixed human text. Neither body ever carries a token value.
 */
export const OPERATOR_ERROR_CODES = {
  /** 503: the server has no RULEBREAK_OPERATOR_TOKEN, so mutations are unavailable. */
  unset: "operator_token_unset",
  /** 401: the header is missing or does not match the configured token (one code for both). */
  invalid: "operator_token_invalid",
} as const;

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
 * Missing/empty RULEBREAK_OPERATOR_TOKEN → 503 `operator_token_unset` (mutations unavailable).
 * Wrong/missing header → 401 `operator_token_invalid`.
 */
export async function requireOperator(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const expected = configuredOperatorToken();
  if (!expected) {
    await reply.code(503).send({
      error: "operator token not configured",
      code: OPERATOR_ERROR_CODES.unset,
      hint: "Set RULEBREAK_OPERATOR_TOKEN for control API mutations",
    });
    return;
  }

  const providedRaw = request.headers[OPERATOR_TOKEN_HEADER];
  const provided = Array.isArray(providedRaw) ? providedRaw[0] : providedRaw;
  if (typeof provided !== "string" || !safeEqual(provided.trim(), expected)) {
    await reply.code(401).send({
      error: "unauthorized operator",
      code: OPERATOR_ERROR_CODES.invalid,
    });
  }
}
