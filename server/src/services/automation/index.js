import { prisma } from "../../db/prisma.js";
import { recordAudit } from "../../lib/audit.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import { asBoolean, asString } from "../../lib/validate.js";
import { runAutomationsForEvent, testAutomation } from "./engine.js";
import { validateWorkflow } from "./schema.js";

export { evaluateConditions } from "./conditions.js";
export { runAutomationsForEvent, testAutomation } from "./engine.js";
export { validateWorkflow, validateConditions, validateActions, validateTrigger } from "./schema.js";

export const descriptor = Object.freeze({
  name: "automation",
  phase: 4,
  description: "Event-driven JSON workflow engine.",
});

/** Internal bookkeeping rows are hidden from the workflows UI. */
const SYSTEM_PREFIX = "[system]";

export function listAutomations({ organizationId, isActive = null, trigger = null, search = null }) {
  const where = { organizationId, name: { not: { startsWith: SYSTEM_PREFIX } } };
  if (isActive !== null && isActive !== undefined) where.isActive = isActive;
  if (trigger) where.trigger = trigger;
  if (search) where.name = { contains: search, mode: "insensitive", not: { startsWith: SYSTEM_PREFIX } };

  return prisma.automation.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    include: {
      _count: { select: { runs: true } },
      runs: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, createdAt: true } },
    },
  });
}

export async function getAutomation({ organizationId, automationId }) {
  const automation = await prisma.automation.findFirst({
    where: { id: automationId, organizationId, name: { not: { startsWith: SYSTEM_PREFIX } } },
    include: { _count: { select: { runs: true } } },
  });

  if (!automation) throw new NotFoundError("Automation not found");
  return automation;
}

export async function createAutomation({
  organizationId,
  name,
  description,
  trigger,
  conditions,
  actions,
  isActive = false,
  req = null,
}) {
  const automationName = asString(name, "name", { required: true, max: 120 });
  const workflow = validateWorkflow({ trigger, conditions, actions });

  const existing = await prisma.automation.findUnique({
    where: { organizationId_name: { organizationId, name: automationName } },
  });
  if (existing) throw new ConflictError("An automation with that name already exists");

  const automation = await prisma.automation.create({
    data: {
      organizationId,
      name: automationName,
      description: asString(description, "description", { max: 400 }),
      trigger: workflow.trigger,
      conditions: workflow.conditions,
      actions: workflow.actions,
      isActive: asBoolean(isActive, "isActive") ?? false,
    },
  });

  await recordAudit({
    organizationId,
    action: "automation.created",
    entityType: "Automation",
    entityId: automation.id,
    metadata: { trigger: automation.trigger, actions: workflow.actions.length },
    req,
  });

  return automation;
}

export async function updateAutomation({
  organizationId,
  automationId,
  data,
  req = null,
}) {
  const automation = await getAutomation({ organizationId, automationId });

  const workflow =
    data.trigger !== undefined || data.conditions !== undefined || data.actions !== undefined
      ? validateWorkflow({
          trigger: data.trigger ?? automation.trigger,
          conditions: data.conditions ?? automation.conditions,
          actions: data.actions ?? automation.actions,
        })
      : null;

  const name = data.name === undefined ? undefined : asString(data.name, "name", { required: true, max: 120 });

  if (name && name !== automation.name) {
    const clash = await prisma.automation.findUnique({
      where: { organizationId_name: { organizationId, name } },
    });
    if (clash) throw new ConflictError("An automation with that name already exists");
  }

  const updated = await prisma.automation.update({
    where: { id: automation.id },
    data: {
      name,
      description:
        data.description === undefined ? undefined : asString(data.description, "description", { max: 400 }),
      ...(workflow ?? {}),
      isActive: asBoolean(data.isActive, "isActive"),
      version: workflow ? { increment: 1 } : undefined,
    },
  });

  await recordAudit({
    organizationId,
    action: "automation.updated",
    entityType: "Automation",
    entityId: automation.id,
    metadata: { fields: Object.keys(data) },
    req,
  });

  return updated;
}

export async function setAutomationActive({ organizationId, automationId, isActive, req = null }) {
  const automation = await getAutomation({ organizationId, automationId });
  const updated = await prisma.automation.update({
    where: { id: automation.id },
    data: { isActive: asBoolean(isActive, "isActive") ?? false },
  });

  await recordAudit({
    organizationId,
    action: updated.isActive ? "automation.activated" : "automation.paused",
    entityType: "Automation",
    entityId: automation.id,
    req,
  });

  return updated;
}

export async function deleteAutomation({ organizationId, automationId, req = null }) {
  const automation = await getAutomation({ organizationId, automationId });
  await prisma.automation.delete({ where: { id: automation.id } });

  await recordAudit({
    organizationId,
    action: "automation.deleted",
    entityType: "Automation",
    entityId: automationId,
    metadata: { name: automation.name },
    req,
  });

  return { deleted: true };
}

export function listAutomationRuns({ organizationId, automationId = null, take = 50 }) {
  return prisma.automationRun.findMany({
    where: { organizationId, ...(automationId ? { automationId } : {}) },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      automation: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true, waId: true } },
      conversation: { select: { id: true } },
    },
  });
}
