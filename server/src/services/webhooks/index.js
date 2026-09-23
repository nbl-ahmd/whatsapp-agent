/**
 * Webhooks module.
 *
 * Owns the `/api/webhooks/whatsapp` endpoints: verification, validation,
 * raw event persistence, tenant resolution and normalization into the internal
 * event model. Must remain fast and idempotent; long work is queued.
 */
export * from "./verify.js";
export * from "./normalize.js";
export { handleWhatsAppWebhook, processInboundMessage, processMessageStatus } from "./process.js";

export const descriptor = Object.freeze({
  name: "webhooks",
  phase: 2,
  description: "Inbound webhook verification, persistence and normalization.",
});
