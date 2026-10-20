import { prisma } from "../../db/prisma.js";
import { recordAudit } from "../../lib/audit.js";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { asBoolean, asInt, asString, asStringArray } from "../../lib/validate.js";
import { listOrganizationTools } from "../tools/index.js";

/**
 * AI agent configuration. An agent is a system prompt plus the set of tools it
 * is allowed to call; the provider (OpenAI-compatible or mock) is global config.
 */

const MAX_TEMPERATURE = 2;

export async function listAgents({ organizationId }) {
  const agents = await prisma.aIAgent.findMany({
    where: { organizationId },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    include: { tools: { select: { id: true, name: true, permission: true, isActive: true } } },
  });

  return agents;
}

export async function getAgent({ organizationId, agentId }) {
  const agent = await prisma.aIAgent.findFirst({
    where: { id: agentId, organizationId },
    include: { tools: true },
  });
  if (!agent) throw new NotFoundError("AI agent not found");
  return agent;
}

async function resolveToolIds({ organizationId, toolIds }) {
  if (toolIds === undefined) return undefined;
  const names = asStringArray(toolIds, "toolIds", { max: 50, itemMaxLength: 80 });

  const tools = await prisma.tool.findMany({
    where: { organizationId, id: { in: names } },
    select: { id: true },
  });
  if (tools.length !== names.length) throw new ValidationError("One or more tools do not exist");

  return tools.map((tool) => ({ id: tool.id }));
}

export async function createAgent({
  organizationId,
  name,
  description,
  systemPrompt,
  model,
  temperature,
  maxTokens,
  toolIds,
  isActive = true,
  req = null,
}) {
  const agentName = asString(name, "name", { required: true, max: 120 });

  const existing = await prisma.aIAgent.findUnique({
    where: { organizationId_name: { organizationId, name: agentName } },
  });
  if (existing) throw new ConflictError("An agent with that name already exists");

  const tools = (await resolveToolIds({ organizationId, toolIds })) ?? [];

  const agent = await prisma.aIAgent.create({
    data: {
      organizationId,
      name: agentName,
      description: asString(description, "description", { max: 400 }),
      systemPrompt: asString(systemPrompt, "systemPrompt", { max: 8000 }),
      model: asString(model, "model", { max: 120 }) ?? "gpt-4o-mini",
      temperature: temperature === undefined ? null : Number(temperature),
      maxTokens: asInt(maxTokens, "maxTokens", { min: 16, max: 8192, fallback: null }),
      isActive: asBoolean(isActive, "isActive") ?? true,
      tools: { connect: tools },
    },
    include: { tools: true },
  });

  await recordAudit({
    organizationId,
    action: "ai_agent.created",
    entityType: "AIAgent",
    entityId: agent.id,
    metadata: { tools: agent.tools.length },
    req,
  });

  return agent;
}

export async function updateAgent({ organizationId, agentId, data, req = null }) {
  const agent = await getAgent({ organizationId, agentId });
  const tools = await resolveToolIds({ organizationId, toolIds: data.toolIds });

  const temperature =
    data.temperature === undefined
      ? undefined
      : data.temperature === null
        ? null
        : Math.max(0, Math.min(MAX_TEMPERATURE, Number(data.temperature)));

  const name = data.name === undefined ? undefined : asString(data.name, "name", { required: true, max: 120 });
  if (name && name !== agent.name) {
    const clash = await prisma.aIAgent.findUnique({
      where: { organizationId_name: { organizationId, name } },
    });
    if (clash) throw new ConflictError("An agent with that name already exists");
  }

  const updated = await prisma.aIAgent.update({
    where: { id: agent.id },
    data: {
      name,
      description:
        data.description === undefined ? undefined : asString(data.description, "description", { max: 400 }),
      systemPrompt:
        data.systemPrompt === undefined
          ? undefined
          : asString(data.systemPrompt, "systemPrompt", { max: 8000 }),
      model: data.model === undefined ? undefined : asString(data.model, "model", { max: 120 }),
      temperature,
      maxTokens: asInt(data.maxTokens, "maxTokens", { min: 16, max: 8192, fallback: undefined }),
      isActive: asBoolean(data.isActive, "isActive"),
      ...(tools ? { tools: { set: tools } } : {}),
    },
    include: { tools: true },
  });

  await recordAudit({
    organizationId,
    action: "ai_agent.updated",
    entityType: "AIAgent",
    entityId: agent.id,
    metadata: { fields: Object.keys(data) },
    req,
  });

  return updated;
}

export async function setAgentActive({ organizationId, agentId, isActive, req = null }) {
  const agent = await getAgent({ organizationId, agentId });
  const updated = await prisma.aIAgent.update({
    where: { id: agent.id },
    data: { isActive: asBoolean(isActive, "isActive") ?? false },
  });

  await recordAudit({
    organizationId,
    action: updated.isActive ? "ai_agent.activated" : "ai_agent.paused",
    entityType: "AIAgent",
    entityId: agent.id,
    req,
  });

  return updated;
}

export async function deleteAgent({ organizationId, agentId, req = null }) {
  const agent = await getAgent({ organizationId, agentId });
  await prisma.aIAgent.delete({ where: { id: agent.id } });

  await recordAudit({
    organizationId,
    action: "ai_agent.deleted",
    entityType: "AIAgent",
    entityId: agentId,
    metadata: { name: agent.name },
    req,
  });

  return { deleted: true };
}

/** Tools the agent can be given, for the agent editor's picker. */
export function agentToolOptions({ organizationId }) {
  return listOrganizationTools({ organizationId });
}
