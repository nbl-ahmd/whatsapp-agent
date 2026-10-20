import { prisma } from "../../db/prisma.js";
import { listTools as listRegisteredTools } from "./registry.js";

export { executeTool, getTool, listTools, registerTool, toolNames } from "./registry.js";
export { internalTools } from "./internal.js";

export const descriptor = Object.freeze({
  name: "tools",
  phase: 5,
  description: "Tool registry with JSON schemas and permissions.",
});

/**
 * Make sure every built-in tool has a row for this organization. Rows are what
 * the UI toggles and what an AI agent links to, so a new internal tool shows up
 * everywhere without a migration.
 */
export async function ensureOrganizationTools({ organizationId }) {
  const definitions = listRegisteredTools();

  for (const definition of definitions) {
    await prisma.tool.upsert({
      where: { organizationId_name: { organizationId, name: definition.name } },
      update: {
        description: definition.description,
        inputSchema: definition.inputSchema,
        type: "internal",
      },
      create: {
        organizationId,
        name: definition.name,
        description: definition.description,
        inputSchema: definition.inputSchema,
        permission: definition.permission,
        type: "internal",
        isActive: true,
      },
    });
  }

  return prisma.tool.findMany({
    where: { organizationId },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: { _count: { select: { agents: true } } },
  });
}

export function listOrganizationTools({ organizationId }) {
  return prisma.tool.findMany({
    where: { organizationId },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: { _count: { select: { agents: true } } },
  });
}

export async function setToolActive({ organizationId, toolId, isActive }) {
  const updated = await prisma.tool.updateMany({
    where: { id: toolId, organizationId },
    data: { isActive },
  });

  if (updated.count === 0) return null;
  return prisma.tool.findFirst({ where: { id: toolId, organizationId } });
}

export async function setToolPermission({ organizationId, toolId, permission }) {
  const updated = await prisma.tool.updateMany({
    where: { id: toolId, organizationId },
    data: { permission },
  });

  if (updated.count === 0) return null;
  return prisma.tool.findFirst({ where: { id: toolId, organizationId } });
}
