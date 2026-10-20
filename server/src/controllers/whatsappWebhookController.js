import { logger } from "../lib/logger.js";
import { listWebhookAppSecrets, listWebhookVerifyTokens } from "../services/settings/index.js";
import { handleWhatsAppWebhook } from "../services/webhooks/process.js";
import { verifyChallenge, verifySignature } from "../services/webhooks/verify.js";

/**
 * GET /api/webhooks/whatsapp - Meta verification handshake.
 *
 * The verify token can come from the environment, the organization's BYOK
 * settings, or an account token pasted on the WhatsApp page.
 */
export async function verifyWebhook(req, res) {
  const expectedTokens = await listWebhookVerifyTokens();

  const result = verifyChallenge({
    mode: req.query["hub.mode"],
    token: req.query["hub.verify_token"],
    challenge: req.query["hub.challenge"],
    expectedTokens,
  });

  if (!result.ok) {
    logger.warn("Webhook verification failed", { reason: result.reason });
    return res.status(403).send("Forbidden");
  }

  return res.status(200).type("text/plain").send(result.challenge);
}

/** Phone number ids named by a webhook payload, used to pick the app secret. */
export function extractPhoneNumberIds(payload) {
  const ids = new Set();
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const id = change?.value?.metadata?.phone_number_id;
      if (id) ids.add(String(id));
    }
  }
  return [...ids];
}

/**
 * POST /api/webhooks/whatsapp - receive events. Always responds 2xx (except for
 * an invalid signature) so Meta does not retry indefinitely; processing is
 * idempotent.
 */
export async function receiveWebhook(req, res) {
  const rawBody = req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(req.body ?? {});
  const signature = req.get("x-hub-signature-256") ?? null;
  const payload = req.body;

  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "invalid JSON body" });
  }

  // Never trust an unsigned payload: extract only the phone number ids to pick
  // which tenant secrets to test the signature against.
  const secrets = await listWebhookAppSecrets({
    phoneNumberIds: extractPhoneNumberIds(payload),
  });

  if (secrets.length > 0) {
    if (!secrets.some((secret) => verifySignature(rawBody, signature, secret))) {
      logger.warn("Rejected webhook with invalid signature");
      return res.status(401).json({ error: "invalid signature" });
    }
  } else {
    logger.warn(
      "No WhatsApp app secret configured; skipping webhook signature verification. " +
        "Store one in Settings or set WHATSAPP_APP_SECRET.",
    );
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
