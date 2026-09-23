import { Router } from "express";
import { sendMessage } from "../controllers/whatsappController.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

router.post("/messages", asyncHandler(sendMessage));

export default router;
