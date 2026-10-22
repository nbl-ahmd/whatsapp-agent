import { Router } from "express";
import * as integrations from "../controllers/integrationsController.js";
import { ADMIN_ROLES, requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

router.use(asyncHandler(requireAuth));

router.get("/", asyncHandler(integrations.index));
router.post("/", requireRole(...ADMIN_ROLES), asyncHandler(integrations.create));
router.patch("/:id", requireRole(...ADMIN_ROLES), asyncHandler(integrations.update));
router.delete("/:id", requireRole(...ADMIN_ROLES), asyncHandler(integrations.remove));
router.post("/:id/test", requireRole(...ADMIN_ROLES), asyncHandler(integrations.test));

export default router;
