import { prisma } from "../db/prisma.js";
import { asInt } from "../lib/validate.js";
import { ok } from "../utils/http.js";

/**
 * Logs. Three views onto the same pipeline: raw webhook events received,
 * automation runs (including skipped ones and their condition results), and the
 * audit trail of who did what.
 */

export async function webhookEvents(req, res) {
  const organizationId = req.auth.organizationId;
  const take = asInt(req.query.limit, "limit", { min: 1, max: 200, fallback: 50 });

  const [events, failedToday] = await Promise.all([
    prisma.webhookEvent.findMany({
      where: { organizationId },
      orderBy: { receivedAt: "desc" },
      take,
      select: {
        id: true,
        source: true,
        eventType: true,
        status: true,
        error: true,
        receivedAt: true,
        processedAt: true,
        payload: true,
      },
    }),
    prisma.webhookEvent.count({
      where: { organizationId, status: "failed", receivedAt: { gte: new Date(Date.now() - 86400000) } },
    }),
  ]);

  return ok(res, { events, failedToday });
}

export async function automationRuns(req, res) {
  const organizationId = req.auth.organizationId;

  const runs = await prisma.automationRun.findMany({
    where: { organizationId, automation: { name: { not: { startsWith: "[system]" } } } },
    orderBy: { createdAt: "desc" },
    take: asInt(req.query.limit, "limit", { min: 1, max: 200, fallback: 50 }),
    include: {
      automation: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true, waId: true } },
    },
  });

  return ok(res, { runs });
}

export async function audit(req, res) {
  const organizationId = req.auth.organizationId;

  const logs = await prisma.auditLog.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: asInt(req.query.limit, "limit", { min: 1, max: 200, fallback: 80 }),
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return ok(res, { logs });
}
