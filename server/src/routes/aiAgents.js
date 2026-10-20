import { Router } from "express";
import * as aiAgents from "../controllers/aiAgentsController.js";
import { ADMIN_ROLES, requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

router.use(asyncHandler(requireAuth));

router.get("/", asyncHandler(aiAgents.index));
router.post("/", requireRole(...ADMIN_ROLES), asyncHandler(aiAgents.create));
router.get("/:id", asyncHandler(aiAgents.show));
router.patch("/:id", requireRole(...ADMIN_ROLES), asyncHandler(aiAgents.update));
router.delete("/:id", requireRole(...ADMIN_ROLES), asyncHandler(aiAgents.remove));
router.post("/:id/toggle", requireRole(...ADMIN_ROLES), asyncHandler(aiAgents.toggle));
router.post("/:id/preview", asyncHandler(aiAgents.preview));

export default router;
