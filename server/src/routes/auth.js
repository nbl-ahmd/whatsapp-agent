import { Router } from "express";
import { me, register, signIn, updatePassword } from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimits.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

router.post("/register", authLimiter, asyncHandler(register));
router.post("/login", authLimiter, asyncHandler(signIn));
router.get("/me", asyncHandler(requireAuth), asyncHandler(me));
router.post("/password", asyncHandler(requireAuth), asyncHandler(updatePassword));

export default router;
