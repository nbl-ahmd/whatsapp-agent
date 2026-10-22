import { randomUUID } from "node:crypto";
import { logger } from "../lib/logger.js";

const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Attach a correlation id to every request and log failures.
 *
 * A caller may supply `x-request-id` (useful when Render/Cloudflare already
 * assigns one), but only when it looks like a safe id. Otherwise the server
 * generates one. The id is returned in the response header and in error bodies.
 */
export function requestContext(req, res, next) {
  const supplied = req.get("x-request-id");
  req.id = supplied && REQUEST_ID.test(supplied) ? supplied : randomUUID();
  res.setHeader("x-request-id", req.id);

  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    // Health probes are frequent and have their own platform signal.
    if (req.originalUrl === "/health" || req.originalUrl === "/health/ready") return;

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const meta = {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
    };

    if (res.statusCode >= 500) logger.error("Request failed", meta);
    else if (res.statusCode >= 400) logger.warn("Request rejected", meta);
    else logger.debug("Request completed", meta);
  });

  next();
}

/** Headers that are safe for a JSON/media API and require no dependencies. */
export function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // Media is opened directly sometimes; a document CSP is unnecessary there and
  // the API is JSON otherwise.
  if (!req.path.startsWith("/api/whatsapp/media/")) {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
  }

  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }

  next();
}
