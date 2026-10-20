import { Router } from "express";
import * as contacts from "../controllers/contactsController.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

router.use(asyncHandler(requireAuth));

router.get("/", asyncHandler(contacts.index));
router.get("/tags", asyncHandler(contacts.tags));
router.get("/:id", asyncHandler(contacts.show));
router.patch("/:id", asyncHandler(contacts.update));
router.post("/:id/tags", asyncHandler(contacts.addTag));
router.delete("/:id/tags/:tag", asyncHandler(contacts.removeTag));

export default router;
