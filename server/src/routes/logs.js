import { Router } from "express";
import * as logs from "../controllers/logsController.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

router.use(asyncHandler(requireAuth));

router.get("/webhook-events", asyncHandler(logs.webhookEvents));
router.get("/automation-runs", asyncHandler(logs.automationRuns));
router.get("/audit", asyncHandler(logs.audit));

export default router;
