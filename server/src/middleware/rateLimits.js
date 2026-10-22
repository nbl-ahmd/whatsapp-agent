import { env } from "../config/env.js";
import { createRateLimiter } from "../lib/rateLimit.js";

/**
 * Shared limiter instances. They are process-local; counters reset on deploy.
 * Limits are configured in server/src/config/env.js.
 */

// Login/register: keyed by client IP to slow credential stuffing.
export const authLimiter = createRateLimiter({
  windowMs: env.rateLimit.authWindowMs,
  max: env.rateLimit.authMax,
  name: "auth",
  message: "Too many sign-in attempts. Try again later.",
});

// Meta retries webhooks, so keep this generous; it only stops floods.
export const webhookLimiter = createRateLimiter({
  windowMs: env.rateLimit.webhookWindowMs,
  max: env.rateLimit.webhookMax,
  name: "webhook",
  message: "Webhook rate limit exceeded",
});

// Outbound sends: per organization when authenticated, otherwise per IP.
export const messageLimiter = createRateLimiter({
  windowMs: env.rateLimit.messageWindowMs,
  max: env.rateLimit.messageMax,
  name: "message",
  keyGenerator: (req) => req.auth?.organizationId ?? req.ip,
  message: "Too many outbound messages. Try again shortly.",
});
