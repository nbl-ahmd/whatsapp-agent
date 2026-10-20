import { Router } from "express";
import * as organizations from "../controllers/organizationsController.js";
import * as users from "../controllers/usersController.js";
import { ADMIN_ROLES, requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

router.use(asyncHandler(requireAuth));

router.get("/", asyncHandler(organizations.show));
router.patch("/", requireRole(...ADMIN_ROLES), asyncHandler(organizations.update));

router.get("/users", asyncHandler(users.index));
router.post("/users", requireRole(...ADMIN_ROLES), asyncHandler(users.create));
router.patch("/users/:id", requireRole(...ADMIN_ROLES), asyncHandler(users.update));

export default router;
