import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { handleWhatsAppWebhook } from "../services/webhooks/process.js";
import { verifyChallenge, verifySignature } from "../services/webhooks/verify.js";

/**
 * GET /api/webhooks/whatsapp - Meta verification handshake.
 */
export function verifyWebhook(req, res) {
  const result = verifyChallenge({
    mode: req.query["hub.mode"],
    token: req.query["hub.verify_token"],
    challenge: req.query["hub.challenge"],
    expectedToken: env.meta.verifyToken,
  });

  if (!result.ok) {
    logger.warn("Webhook verification failed", { reason: result.reason });
    return res.status(403).send("Forbidden");
  }

  return res.status(200).type("text/plain").send(result.challenge);
}

/**
 * POST /api/webhooks/whatsapp - receive events. Always responds 2xx (except for
 * an invalid signature) so Meta does not retry indefinitely; processing is
 * idempotent.
 */
export async function receiveWebhook(req, res) {
  const rawBody = req.rawBody
    ? req.rawBody.toString("utf8")
    : JSON.stringify(req.body ?? {});
  const signature = req.get("x-hub-signature-256") ?? null;

  if (env.meta.appSecret) {
    if (!verifySignature(rawBody, signature, env.meta.appSecret)) {
      logger.warn("Rejected webhook with invalid signature");
      return res.status(401).json({ error: "invalid signature" });
    }
  } else {
    logger.warn("WHATSAPP_APP_SECRET is not set; skipping webhook signature verification");
  }

  const payload = req.body;
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "invalid JSON body" });
  }

  const headers = {
    "content-type": req.get("content-type"),
    "x-hub-signature-256": signature,
    "user-agent": req.get("user-agent"),
  };

  try {
    const result = await handleWhatsAppWebhook({ rawBody, payload, headers });
    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    logger.error("Webhook processing failed", { error: error?.message });
    // Acknowledge to Meta even on processing failure; the raw event is stored.
    return res.status(200).json({ received: true, error: "processing_failed" });
  }
}
