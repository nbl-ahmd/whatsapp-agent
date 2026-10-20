import { Router } from "express";
import * as settings from "../controllers/settingsController.js";
import { ADMIN_ROLES, requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

router.use(asyncHandler(requireAuth));

router.get("/", asyncHandler(settings.show));
router.patch("/", requireRole(...ADMIN_ROLES), asyncHandler(settings.update));
router.post("/test-ai", requireRole(...ADMIN_ROLES), asyncHandler(settings.testAi));

export default router;
