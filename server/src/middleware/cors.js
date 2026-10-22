import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

/**
 * CORS restricted to explicitly configured browser origins (FRONTEND_URL,
 * comma separated).
 *
 * Entries are normalized so a trailing slash or a pasted URL with a path still
 * works. A constrained wildcard is allowed for preview deployments, e.g.
 * `https://*.vercel.app`; a bare `*` is ignored. The request Origin is always
 * reflected, never replaced with `*`, so credentials stay safe.
 */

const warnedOrigins = new Set();

function normalizeOrigin(value) {
  const trimmed = String(value ?? "").trim().replace(/\/+$/, "");
  if (!trimmed || trimmed === "*") return null;

  try {
    const url = new URL(trimmed);
    if (!/^https?:$/.test(url.protocol)) return null;
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return null;
  }
}

function allowedPatterns() {
  return env.frontendUrl
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

function matchesPattern(origin, pattern) {
  const candidate = origin.toLowerCase();
  if (!pattern.includes("*")) return candidate === pattern;

  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]+");
  return new RegExp(`^${escaped}$`, "i").test(candidate);
}

export function isOriginAllowed(origin) {
  if (!origin) return false;
  return allowedPatterns().some((pattern) => matchesPattern(origin, pattern));
}

export function corsMiddleware(req, res, next) {
  const origin = req.get("origin");
  const allowed = origin ? isOriginAllowed(origin) : false;

  if (origin) {
    res.setHeader("Vary", "Origin");
    if (allowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type,Authorization,x-test-api-key,x-request-id",
      );
      res.setHeader(
        "Access-Control-Expose-Headers",
        "x-request-id,RateLimit-Limit,RateLimit-Remaining,RateLimit-Reset,Retry-After",
      );
      res.setHeader("Access-Control-Max-Age", "600");
    } else if (!warnedOrigins.has(origin)) {
      // One warning per origin makes a deployment misconfiguration obvious in
      // Render logs without flooding them.
      warnedOrigins.add(origin);
      logger.warn("Blocked browser origin by CORS; check FRONTEND_URL", { origin });
    }
  }

  if (req.method === "OPTIONS") {
    res.status(origin && !allowed ? 403 : 204).end();
    return;
  }

  next();
}
