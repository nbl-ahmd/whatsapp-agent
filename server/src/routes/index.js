import healthRouter from "./health.js";
import whatsappWebhookRouter from "./webhooks/whatsapp.js";
import whatsappRouter from "./whatsapp.js";

export function registerRoutes(app) {
  app.use("/health", healthRouter);
  app.use("/api/webhooks/whatsapp", whatsappWebhookRouter);
  app.use("/api/whatsapp", whatsappRouter);
}
