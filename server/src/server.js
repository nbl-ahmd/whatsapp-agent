import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";

const app = createApp();

const server = app.listen(env.port, env.host, () => {
  logger.info("API server listening", {
    host: env.host,
    port: env.port,
    environment: env.nodeEnv,
  });
});

function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down`);
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
