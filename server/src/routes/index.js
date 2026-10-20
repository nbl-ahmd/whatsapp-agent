import aiAgentsRouter from "./aiAgents.js";
import authRouter from "./auth.js";
import automationsRouter from "./automations.js";
import contactsRouter from "./contacts.js";
import conversationsRouter from "./conversations.js";
import dashboardRouter from "./dashboard.js";
import healthRouter from "./health.js";
import integrationsRouter from "./integrations.js";
import logsRouter from "./logs.js";
import organizationsRouter from "./organizations.js";
import toolsRouter from "./tools.js";
import whatsappWebhookRouter from "./webhooks/whatsapp.js";
import whatsappRouter from "./whatsapp.js";

export function registerRoutes(app) {
  app.use("/health", healthRouter);

  // Meta calls these two; they are the only public write endpoints.
  app.use("/api/webhooks/whatsapp", whatsappWebhookRouter);

  app.use("/api/auth", authRouter);
  app.use("/api/organizations", organizationsRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/contacts", contactsRouter);
  app.use("/api/conversations", conversationsRouter);
  app.use("/api/automations", automationsRouter);
  app.use("/api/ai-agents", aiAgentsRouter);
  app.use("/api/tools", toolsRouter);
  app.use("/api/integrations", integrationsRouter);
  app.use("/api/logs", logsRouter);
  app.use("/api/whatsapp", whatsappRouter);
}
