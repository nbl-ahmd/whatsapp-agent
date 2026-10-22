/**
 * Central environment configuration for the standalone backend.
 *
 * Rules:
 * - Never log the values returned here (they may contain secrets).
 * - Missing optional values are allowed; missing required values fail when the
 *   dependent feature is actually used, not at import time.
 *
 * Local `.env` files are loaded best-effort. In production (e.g. Render) the
 * platform injects variables directly.
 */

function loadEnvFiles() {
  for (const file of [".env", "../.env", "server/.env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // file may not exist; ignore
    }
  }
}

if (process.env.DATABASE_URL === undefined && process.env.PORT === undefined) {
  loadEnvFiles();
}

function optional(name, fallback = "") {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

export const env = {
  nodeEnv: optional("NODE_ENV", "development"),
  isProduction: process.env.NODE_ENV === "production",

  // Server binding. Render provides PORT; never hardcode it in production.
  port: Number(optional("PORT", "4000")),
  host: optional("HOST", "0.0.0.0"),

  // Browser origin(s) allowed to call this API (comma separated).
  frontendUrl: optional("FRONTEND_URL", "http://localhost:3000"),

  logLevel: optional("LOG_LEVEL", "info"),

  // Session tokens. Falls back to ENCRYPTION_KEY so a local .env only needs one
  // generated secret; both must be set explicitly in production.
  authSecret: optional("AUTH_SECRET", optional("ENCRYPTION_KEY")),
  authTokenTtlHours: Number(optional("AUTH_TOKEN_TTL_HOURS", "168")),

  databaseUrl: optional("DATABASE_URL"),
  redisUrl: optional("REDIS_URL"),
  encryptionKey: optional("ENCRYPTION_KEY"),

  meta: {
    graphApiBaseUrl: optional("WHATSAPP_GRAPH_API_BASE_URL", "https://graph.facebook.com"),
    graphApiVersion: optional("WHATSAPP_GRAPH_API_VERSION", "v21.0"),
    verifyToken: optional("WHATSAPP_VERIFY_TOKEN"),
    appSecret: optional("WHATSAPP_APP_SECRET"),
    accessToken: optional("WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: optional("WHATSAPP_PHONE_NUMBER_ID"),
    businessAccountId: optional("WHATSAPP_BUSINESS_ACCOUNT_ID"),
    testApiKey: optional("WHATSAPP_TEST_API_KEY"),
  },

  ai: {
    // "openai" (OpenAI-compatible /chat/completions) or "mock" (deterministic
    // local provider used when no API key is configured).
    provider: optional("AI_PROVIDER") || (optional("AI_API_KEY") ? "openai" : "mock"),
    apiKey: optional("AI_API_KEY"),
    baseUrl: optional("AI_BASE_URL", "https://api.openai.com/v1"),
    model: optional("AI_MODEL", "gpt-4o-mini"),
  },

  // Per-process fixed-window limits. Override the defaults only when real
  // traffic shows they are wrong for the deployment.
  rateLimit: {
    authMax: Number(optional("AUTH_RATE_LIMIT_MAX", "20")),
    authWindowMs: Number(optional("AUTH_RATE_LIMIT_WINDOW_MS", "900000")),
    webhookMax: Number(optional("WEBHOOK_RATE_LIMIT_MAX", "600")),
    webhookWindowMs: Number(optional("WEBHOOK_RATE_LIMIT_WINDOW_MS", "60000")),
    messageMax: Number(optional("MESSAGE_RATE_LIMIT_MAX", "60")),
    messageWindowMs: Number(optional("MESSAGE_RATE_LIMIT_WINDOW_MS", "60000")),
  },
};

/**
 * Assert that environment variables are present.
 * @param {string[]} names
 * @returns {Record<string, string>}
 */
export function requireEnv(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        "Copy .env.example to .env and fill them in.",
    );
  }
  return Object.fromEntries(names.map((name) => [name, process.env[name]]));
}

/**
 * Validate the configuration for a given feature group. Used at runtime by the
 * module that needs it, so the rest of the app can boot without credentials.
 * @param {"meta" | "ai" | "database" | "redis"} group
 */
export function requireFeature(group) {
  switch (group) {
    case "database":
      return requireEnv(["DATABASE_URL"]);
    case "redis":
      return requireEnv(["REDIS_URL"]);
    case "meta":
      return requireEnv([
        "WHATSAPP_VERIFY_TOKEN",
        "WHATSAPP_APP_SECRET",
        "WHATSAPP_ACCESS_TOKEN",
        "WHATSAPP_PHONE_NUMBER_ID",
      ]);
    case "ai":
      return requireEnv(["AI_API_KEY"]);
    default:
      throw new Error(`Unknown feature group: ${group}`);
  }
}
