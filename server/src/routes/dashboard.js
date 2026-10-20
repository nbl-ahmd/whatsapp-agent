import { Router } from "express";
import { dashboard } from "../controllers/dashboardController.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

router.use(asyncHandler(requireAuth));
router.get("/", asyncHandler(dashboard));

export default router;
