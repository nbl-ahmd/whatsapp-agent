import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta webhook verification.
 *
 * - GET verification compares `hub.verify_token` with the configured token.
 * - POST payloads are signed with `X-Hub-Signature-256` (HMAC-SHA256 of the raw
 *   body using the Meta app secret). Always verify against the raw body.
 */

/**
 * @param {{ mode?: string|null, token?: string|null, challenge?: string|null, expectedToken?: string, expectedTokens?: string[] }} params
 */
export function verifyChallenge({ mode, token, challenge, expectedToken, expectedTokens }) {
  const candidates = expectedTokens ?? (expectedToken ? [expectedToken] : []);
  if (candidates.length === 0) return { ok: false, reason: "verify_token_not_configured" };
  if (mode !== "subscribe") return { ok: false, reason: "invalid_mode" };
  if (!token || !candidates.includes(token)) return { ok: false, reason: "invalid_token" };
  if (!challenge) return { ok: false, reason: "missing_challenge" };
  return { ok: true, challenge };
}

/**
 * @param {string} rawBody
 * @param {string|null|undefined} signatureHeader value of x-hub-signature-256
 * @param {string} appSecret
 */
export function verifySignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader || !appSecret) return false;

  const [scheme, provided] = signatureHeader.split("=");
  if (scheme !== "sha256" || !provided) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(provided, "hex");

  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}
