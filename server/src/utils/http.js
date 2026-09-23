import { isAppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

/**
 * Express response helpers. Keeps HTTP mapping in one place so controllers stay
 * thin and services stay framework-agnostic.
 */

export function ok(res, data = {}) {
  return res.status(200).json({ data });
}

export function created(res, data = {}) {
  return res.status(201).json({ data });
}

export function sendError(res, error) {
  if (isAppError(error)) {
    return res.status(error.statusCode).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
  }

  logger.error("Unhandled request error", {
    error: error?.message,
    stack: error?.stack,
  });
  return res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
}

/** Wrap async route handlers so rejected promises reach the error middleware. */
export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
