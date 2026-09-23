import { Router } from "express";

const router = Router();

/** GET /health - Render health check. Exposes no secrets or internal config. */
router.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

export default router;
