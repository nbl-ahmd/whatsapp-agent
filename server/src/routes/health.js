import { Router } from "express";
import { prisma } from "../db/prisma.js";

const router = Router();

/** GET /health - Render liveness check. Exposes no secrets or internal config. */
router.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

/**
 * GET /health/ready - readiness probe.
 *
 * Unlike /health this actually touches PostgreSQL, so a deploy that cannot reach
 * its database is marked unhealthy instead of accepting traffic. Error details
 * are deliberately not returned (they can contain connection strings).
 */
router.get("/ready", async (_req, res) => {
  const checks = { database: "ok", schema: "ok" };
  let ready = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    ready = false;
    checks.database = "unavailable";
  }

  if (ready) {
    try {
      // A reachable database can still be unmigrated; that is a deploy failure,
      // not a healthy service.
      await prisma.$queryRaw`SELECT 1 FROM "User" LIMIT 1`;
    } catch {
      ready = false;
      checks.schema = "missing";
    }
  }

  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    checks,
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

export default router;
