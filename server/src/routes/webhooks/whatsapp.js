import { Router } from "express";
import {
  receiveWebhook,
  verifyWebhook,
} from "../../controllers/whatsappWebhookController.js";
import { asyncHandler } from "../../utils/http.js";

const router = Router();

router.get("/", asyncHandler(verifyWebhook));
router.post("/", asyncHandler(receiveWebhook));

export default router;
