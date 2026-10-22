import { logger } from "../lib/logger.js";
import { sendError } from "../utils/http.js";

export function notFound(req, res) {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Not found", requestId: req.id },
  });
}

export function errorHandler(error, req, res, _next) {
  if (error?.type === "entity.parse.failed") {
    logger.warn("Rejected request with invalid JSON body", {
      requestId: req.id,
      path: req.originalUrl,
    });
    return res.status(400).json({
      error: { code: "INVALID_JSON", message: "Invalid JSON body", requestId: req.id },
    });
  }

  return sendError(res, error, { requestId: req.id });
}
