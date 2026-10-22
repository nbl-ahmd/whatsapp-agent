import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * Optional one-way error reporting.
 *
 * When ERROR_WEBHOOK_URL is set, unhandled server errors are POSTed as JSON to
 * that endpoint (Slack relay, PagerDuty proxy, internal collector, ...). Only a
 * short, redaction-friendly shape is sent: no request bodies, headers, tokens or
 * customer messages. Delivery is best-effort and never blocks the response.
 */

let lastSentAt = 0;
const MIN_INTERVAL_MS = 5_000;

export function reportError({ error, requestId, method, path, organizationId }) {
  const url = env.errorWebhookUrl;
  if (!url) return Promise.resolve(false);

  const now = Date.now();
  if (now - lastSentAt < MIN_INTERVAL_MS) return Promise.resolve(false);
  lastSentAt = now;

  const payload = {
    source: "whatsapp-agent",
    at: new Date().toISOString(),
    requestId: requestId ?? null,
    method: method ?? null,
    path: path ?? null,
    organizationId: organizationId ?? null,
    error: {
      name: error?.name ?? "Error",
      message: error?.message ?? "Unknown error",
      stack: typeof error?.stack === "string" ? error.stack.split("\n").slice(0, 12).join("\n") : null,
    },
  };

  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5_000),
  })
    .then((response) => response.ok)
    .catch((failure) => {
      logger.warn("Error webhook delivery failed", { error: failure?.message });
      return false;
    });
}
