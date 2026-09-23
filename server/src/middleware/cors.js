import { env } from "../config/env.js";

/**
 * CORS restricted to explicitly configured browser origins (FRONTEND_URL,
 * comma separated). Never uses a wildcard origin.
 */
function allowedOrigins() {
  return env.frontendUrl
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function corsMiddleware(req, res, next) {
  const origin = req.get("origin");

  if (origin && allowedOrigins().includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type,Authorization,x-test-api-key",
    );
    res.setHeader("Access-Control-Max-Age", "600");
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}
