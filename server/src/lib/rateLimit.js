import { RateLimitError } from "./errors.js";

/**
 * Small in-memory fixed-window rate limiter.
 *
 * Deliberately dependency-free and per-process: it protects a single Render
 * instance from brute-force and accidental floods. If the API scales to several
 * instances, move the counter to Redis behind this same middleware signature.
 */

const MAX_BUCKETS = 10_000;

export function createRateLimiter({
  windowMs,
  max,
  name = "default",
  keyGenerator = (req) => req.ip,
  message = "Too many requests, slow down and retry later",
}) {
  const buckets = new Map();
  let lastSweep = Date.now();

  function sweep(now) {
    if (now - lastSweep < windowMs) return;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
    lastSweep = now;
  }

  return function rateLimit(req, res, next) {
    const now = Date.now();
    sweep(now);

    const key = `${name}:${keyGenerator(req) || "unknown"}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      if (buckets.size >= MAX_BUCKETS) {
        // Bound memory under a spray of unique keys: drop the oldest entry.
        buckets.delete(buckets.keys().next().value);
      }
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, max - bucket.count);
    const resetSeconds = Math.ceil(bucket.resetAt / 1000);

    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(resetSeconds));

    if (bucket.count > max) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return next(new RateLimitError(message));
    }

    return next();
  };
}
