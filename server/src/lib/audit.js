import { prisma } from "../db/prisma.js";
import { logger } from "./logger.js";

/**
 * Audit trail for tenant-visible actions. Writing an audit row must never break
 * the action it records, so failures are logged and swallowed.
 */
export async function recordAudit({
  organizationId = null,
  userId = null,
  actorType = "user",
  action,
  entityType = null,
  entityId = null,
  metadata = null,
  req = null,
}) {
  try {
    return await prisma.auditLog.create({
      data: {
        organizationId,
        userId,
        actorType,
        action,
        entityType,
        entityId,
        metadata: metadata ?? undefined,
        ipAddress: req?.ip ?? null,
        userAgent: req?.get?.("user-agent") ?? null,
      },
    });
  } catch (error) {
    logger.warn("Could not write audit log", { action, error: error?.message });
    return null;
  }
}
