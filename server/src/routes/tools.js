import { Router } from "express";
import * as tools from "../controllers/toolsController.js";
import { ADMIN_ROLES, requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

router.use(asyncHandler(requireAuth));

router.get("/", asyncHandler(tools.index));
router.patch("/:id", requireRole(...ADMIN_ROLES), asyncHandler(tools.update));

export default router;
