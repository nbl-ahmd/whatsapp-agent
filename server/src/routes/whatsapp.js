import { Router } from "express";
import * as accounts from "../controllers/whatsappAccountsController.js";
import * as flows from "../controllers/whatsappFlowsController.js";
import * as templates from "../controllers/whatsappTemplatesController.js";
import { media, sendMessage } from "../controllers/whatsappController.js";
import { ADMIN_ROLES, optionalAuth, requireAuth, requireRole } from "../middleware/auth.js";
import { messageLimiter } from "../middleware/rateLimits.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();
const admin = requireRole(...ADMIN_ROLES);

// Outbound send: an operator session, or a server-to-server caller holding the
// shared test key (see whatsappController.requireServerAccess).
router.post("/messages", optionalAuth, messageLimiter, asyncHandler(sendMessage));

// Inbound media proxy (authenticated; streams bytes, never returns the token).
router.get("/media/:messageId", asyncHandler(requireAuth), asyncHandler(media));

// Connection management (Settings → WhatsApp).
router.get("/numbers", asyncHandler(requireAuth), asyncHandler(accounts.numbers));
router.get("/accounts", asyncHandler(requireAuth), asyncHandler(accounts.accounts));
router.get("/webhook-status", asyncHandler(requireAuth), asyncHandler(accounts.webhookStatus));
router.post("/accounts", asyncHandler(requireAuth), admin, asyncHandler(accounts.create));
router.patch("/numbers/:id", asyncHandler(requireAuth), admin, asyncHandler(accounts.update));
router.delete("/numbers/:id", asyncHandler(requireAuth), admin, asyncHandler(accounts.remove));
router.post(
  "/numbers/:id/verify",
  asyncHandler(requireAuth),
  admin,
  asyncHandler(accounts.verify),
);

// Test-number setup: discover numbers under a WABA, connect one, and prove the
// wiring with diagnostics, a webhook handshake and an optional inbound event.
router.post("/meta/discover", asyncHandler(requireAuth), admin, asyncHandler(accounts.discover));
router.post("/meta/connect", asyncHandler(requireAuth), admin, asyncHandler(accounts.connect));
router.post("/webhook-test", asyncHandler(requireAuth), admin, asyncHandler(accounts.webhookTest));
router.get(
  "/webhook/subscription",
  asyncHandler(requireAuth),
  admin,
  asyncHandler(accounts.subscription),
);
router.post(
  "/webhook/subscribe",
  asyncHandler(requireAuth),
  admin,
  asyncHandler(accounts.subscribe),
);
router.post("/diagnostics", asyncHandler(requireAuth), admin, asyncHandler(accounts.diagnostics));
router.post(
  "/test-inbound",
  asyncHandler(requireAuth),
  admin,
  asyncHandler(accounts.testInbound),
);

// Message templates. Reads default to APPROVED so the inbox picker stays safe;
// the management page asks for status=all.
router.get("/templates", asyncHandler(requireAuth), asyncHandler(templates.list));
router.get("/templates/:templateId", asyncHandler(requireAuth), asyncHandler(templates.detail));
router.post("/templates", asyncHandler(requireAuth), admin, asyncHandler(templates.create));
router.patch(
  "/templates/:templateId",
  asyncHandler(requireAuth),
  admin,
  asyncHandler(templates.update),
);
router.delete(
  "/templates/:templateId",
  asyncHandler(requireAuth),
  admin,
  asyncHandler(templates.remove),
);

// WhatsApp Flows.
router.get("/flows", asyncHandler(requireAuth), asyncHandler(flows.list));
router.get("/flows/:flowId", asyncHandler(requireAuth), asyncHandler(flows.detail));
router.get("/flows/:flowId/assets", asyncHandler(requireAuth), asyncHandler(flows.assets));
router.get("/flows/:flowId/json", asyncHandler(requireAuth), asyncHandler(flows.json));
router.post("/flows", asyncHandler(requireAuth), admin, asyncHandler(flows.create));
router.patch("/flows/:flowId", asyncHandler(requireAuth), admin, asyncHandler(flows.update));
router.post(
  "/flows/:flowId/assets",
  asyncHandler(requireAuth),
  admin,
  asyncHandler(flows.upload),
);
router.post(
  "/flows/:flowId/publish",
  asyncHandler(requireAuth),
  admin,
  asyncHandler(flows.publish),
);
router.post(
  "/flows/:flowId/deprecate",
  asyncHandler(requireAuth),
  admin,
  asyncHandler(flows.deprecate),
);
router.delete("/flows/:flowId", asyncHandler(requireAuth), admin, asyncHandler(flows.remove));

export default router;
