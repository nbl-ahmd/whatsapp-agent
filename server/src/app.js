import express from "express";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { requestContext, securityHeaders } from "./middleware/requestContext.js";
import { registerRoutes } from "./routes/index.js";

/**
 * Build the Express application. Exported separately from `server.js` so it can
 * be imported by tests without binding a port.
 */
export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  // Correlation id + security headers run before anything that can reject.
  app.use(requestContext);
  app.use(securityHeaders);
  app.use(corsMiddleware);

  // Keep the raw body so webhook signature verification can HMAC the exact bytes.
  app.use(
    express.json({
      limit: "1mb",
      verify: (req, _res, buffer) => {
        req.rawBody = buffer;
      },
    }),
  );

  registerRoutes(app);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
