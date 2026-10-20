import { Router } from "express";
import * as accounts from "../controllers/whatsappAccountsController.js";
import { sendMessage } from "../controllers/whatsappController.js";
import { ADMIN_ROLES, optionalAuth, requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

// Outbound send: an operator session, or a server-to-server caller holding the
// shared test key (see whatsappController.requireServerAccess).
router.post("/messages", optionalAuth, asyncHandler(sendMessage));

// Connection management (WhatsApp page).
router.get("/numbers", asyncHandler(requireAuth), asyncHandler(accounts.numbers));
router.get("/accounts", asyncHandler(requireAuth), asyncHandler(accounts.accounts));
router.get("/webhook-status", asyncHandler(requireAuth), asyncHandler(accounts.webhookStatus));
router.post("/accounts", asyncHandler(requireAuth), requireRole(...ADMIN_ROLES), asyncHandler(accounts.create));
router.patch("/numbers/:id", asyncHandler(requireAuth), requireRole(...ADMIN_ROLES), asyncHandler(accounts.update));
router.post(
  "/numbers/:id/verify",
  asyncHandler(requireAuth),
  requireRole(...ADMIN_ROLES),
  asyncHandler(accounts.verify),
);

export default router;
