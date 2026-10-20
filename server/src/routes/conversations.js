import { Router } from "express";
import * as conversations from "../controllers/conversationsController.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

router.use(asyncHandler(requireAuth));

router.get("/", asyncHandler(conversations.index));
router.get("/:id", asyncHandler(conversations.show));
router.get("/:id/messages", asyncHandler(conversations.messages));
router.post("/:id/messages", asyncHandler(conversations.reply));
router.post("/:id/mode", asyncHandler(conversations.updateMode));
router.post("/:id/status", asyncHandler(conversations.updateStatus));
router.post("/:id/assign", asyncHandler(conversations.assign));
router.post("/:id/read", asyncHandler(conversations.read));

export default router;
