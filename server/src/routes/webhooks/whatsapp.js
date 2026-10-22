import { Router } from "express";
import {
  receiveWebhook,
  verifyWebhook,
} from "../../controllers/whatsappWebhookController.js";
import { webhookLimiter } from "../../middleware/rateLimits.js";
import { asyncHandler } from "../../utils/http.js";

const router = Router();

router.get("/", webhookLimiter, asyncHandler(verifyWebhook));
router.post("/", webhookLimiter, asyncHandler(receiveWebhook));

export default router;
