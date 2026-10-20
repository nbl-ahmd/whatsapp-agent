import { Router } from "express";
import * as automations from "../controllers/automationsController.js";
import { ADMIN_ROLES, requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

router.use(asyncHandler(requireAuth));

router.get("/", asyncHandler(automations.index));
router.post("/", requireRole(...ADMIN_ROLES), asyncHandler(automations.create));
router.get("/:id", asyncHandler(automations.show));
router.patch("/:id", requireRole(...ADMIN_ROLES), asyncHandler(automations.update));
router.delete("/:id", requireRole(...ADMIN_ROLES), asyncHandler(automations.remove));
router.post("/:id/toggle", requireRole(...ADMIN_ROLES), asyncHandler(automations.toggle));
router.post("/:id/test", asyncHandler(automations.test));
router.get("/:id/runs", asyncHandler(automations.runs));

export default router;
