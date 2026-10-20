import { prisma } from "../../db/prisma.js";
import { recordAudit } from "../../lib/audit.js";
import { NotFoundError } from "../../lib/errors.js";
import { ensureOrganizationTools } from "../tools/index.js";

export const descriptor = Object.freeze({
  name: "organizations",
  phase: 1,
  description: "Organization profile, team and tenant-level settings.",
});

const DEFAULT_SYSTEM_PROMPT = [
  "You are the WhatsApp assistant for {{organization}}.",
  "Answer in the customer's language, keep replies short and friendly, and never invent order, stock or pricing details.",
  "Use the tools you have to look up or change the customer's record.",
  "If the customer asks for a human, is upset, or you are unsure, call handoff_to_human.",
].join(" ");

/**
 * Give a brand-new organization a working starting point: the built-in tools,
 * an AI agent connected to them, and two disabled example automations that show
 * the JSON workflow shape.
 */
export async function bootstrapOrganizationDefaults({ organizationId }) {
  const tools = await ensureOrganizationTools({ organizationId });

  const existingAgent = await prisma.aIAgent.findFirst({ where: { organizationId } });
  if (!existingAgent) {
    await prisma.aIAgent.create({
      data: {
        organizationId,
        name: "Support assistant",
        description: "First responder for every inbound WhatsApp message.",
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        temperature: 0.3,
        isActive: true,
        tools: { connect: tools.map((tool) => ({ id: tool.id })) },
      },
    });
  }

  const examples = [
    {
      name: "Welcome new contacts",
      description: "Greets a contact the first time they start a conversation.",
      trigger: "CONVERSATION_STARTED",
      conditions: [{ type: "contact_tag", operator: "not_has", value: "welcomed" }],
      actions: [
        { type: "send_message", text: "Hi {{contact.name}}, thanks for messaging us! How can we help?" },
        { type: "add_tag", tag: "welcomed" },
      ],
    },
    {
      name: "Refund requests to a human",
      description: "Routes messages that mention a refund to the team inbox.",
      trigger: "MESSAGE_RECEIVED",
      conditions: [{ type: "contains", value: "refund" }],
      actions: [
        { type: "handoff_human", note: "Refund request keyword" },
        { type: "send_message", text: "Thanks for flagging that - a teammate will pick this up shortly." },
      ],
    },
  ];

  for (const example of examples) {
    await prisma.automation.upsert({
      where: { organizationId_name: { organizationId, name: example.name } },
      update: {},
      create: {
        organizationId,
        name: example.name,
        description: example.description,
        trigger: example.trigger,
        conditions: example.conditions,
        actions: example.actions,
        isActive: false,
      },
    });
  }

  await recordAudit({
    organizationId,
    actorType: "system",
    action: "organization.bootstrapped",
    entityType: "Organization",
    entityId: organizationId,
    metadata: { tools: tools.length },
  });
}

export async function getOrganization({ organizationId }) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { _count: { select: { users: true, contacts: true, conversations: true, messages: true } } },
  });

  if (!organization) throw new NotFoundError("Organization not found");
  return organization;
}

export async function updateOrganization({ organizationId, data, req = null }) {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) throw new NotFoundError("Organization not found");

  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: {
      name: data.name === undefined ? undefined : data.name,
      settings: data.settings === undefined ? undefined : data.settings,
    },
  });

  await recordAudit({
    organizationId,
    action: "organization.updated",
    entityType: "Organization",
    entityId: organizationId,
    metadata: { fields: Object.keys(data) },
    req,
  });

  return updated;
}
