import { Router } from "express";
import { index } from "../controllers/integrationsController.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

router.use(asyncHandler(requireAuth));
router.get("/", asyncHandler(index));

export default router;
