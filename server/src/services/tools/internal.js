import { CONVERSATION_MODE, EVENT_TYPE } from "../../lib/constants.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { recordAudit } from "../../lib/audit.js";
import {
  addContactTag,
  getContact,
  removeContactTag,
  updateContact,
} from "../contacts/service.js";
import { getConversation, setConversationMode } from "../conversations/service.js";
import { listConversationMessages } from "../messages/service.js";
import { sendTextMessage } from "../messages/outbound.js";
import { prisma } from "../../db/prisma.js";

/**
 * Built-in tools. Each one is an explicit, schema-validated capability that the
 * AI agent (or an automation action) may call. Nothing here exposes the
 * database or an arbitrary API to the model.
 */

async function requireContact({ organizationId, contactId }) {
  const contact = await getContact({ organizationId, contactId });
  if (!contact) throw new NotFoundError("Contact not found");
  return contact;
}

async function requireConversation({ organizationId, conversationId }) {
  const conversation = await getConversation({ organizationId, conversationId });
  if (!conversation) throw new NotFoundError("Conversation not found");
  return conversation;
}

/** Field subset returned to the model: no internal ids, no tenant metadata. */
function publicContact(contact) {
  return {
    id: contact.id,
    name: contact.name ?? contact.profileName ?? null,
    waId: contact.waId,
    email: contact.email ?? null,
    locale: contact.locale ?? null,
    tags: contact.tags,
    attributes: contact.attributes ?? null,
    lastSeenAt: contact.lastSeenAt,
  };
}

export const internalTools = [
  {
    name: "get_contact",
    description: "Look up the WhatsApp contact this conversation belongs to, including tags.",
    permission: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async execute({ context }) {
      const contact = await requireContact(context);
      return publicContact(contact);
    },
  },
  {
    name: "update_contact",
    description: "Update the contact's stored name, email, locale or custom attributes.",
    permission: "write",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        locale: { type: "string" },
        attributes: { type: "object" },
      },
      additionalProperties: false,
    },
    async execute({ args, context }) {
      const updated = await updateContact({
        organizationId: context.organizationId,
        contactId: context.contactId,
        data: {
          ...(args.name !== undefined ? { name: args.name } : {}),
          ...(args.email !== undefined ? { email: args.email } : {}),
          ...(args.locale !== undefined ? { locale: args.locale } : {}),
          ...(args.attributes !== undefined ? { attributes: args.attributes } : {}),
        },
      });
      return publicContact(updated);
    },
  },
  {
    name: "add_tag",
    description: "Add a tag to the contact so automations and filters can find them later.",
    permission: "write",
    inputSchema: {
      type: "object",
      properties: { tag: { type: "string" } },
      required: ["tag"],
      additionalProperties: false,
    },
    async execute({ args, context }) {
      const contact = await addContactTag({
        organizationId: context.organizationId,
        contactId: context.contactId,
        tag: args.tag,
      });
      return { contactId: contact.id, tags: contact.tags };
    },
  },
  {
    name: "remove_tag",
    description: "Remove a tag from the contact.",
    permission: "write",
    inputSchema: {
      type: "object",
      properties: { tag: { type: "string" } },
      required: ["tag"],
      additionalProperties: false,
    },
    async execute({ args, context }) {
      const contact = await removeContactTag({
        organizationId: context.organizationId,
        contactId: context.contactId,
        tag: args.tag,
      });
      return { contactId: contact.id, tags: contact.tags };
    },
  },
  {
    name: "get_conversation",
    description:
      "Read the current conversation: its responder mode, status, stored variables and most recent messages.",
    permission: "read",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer" } },
      additionalProperties: false,
    },
    async execute({ args, context }) {
      const conversation = await requireConversation(context);
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
      const messages = await listConversationMessages({
        organizationId: context.organizationId,
        conversationId: conversation.id,
        take: limit,
      });

      return {
        id: conversation.id,
        mode: conversation.mode,
        status: conversation.status,
        variables: conversation.variables ?? {},
        messages: messages.map((message) => ({
          direction: message.direction,
          text: message.text,
          at: message.timestamp,
        })),
      };
    },
  },
  {
    name: "send_whatsapp_message",
    description:
      "Send a WhatsApp text message to the customer. This is the only way the agent can speak to them.",
    permission: "write",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
      additionalProperties: false,
    },
    async execute({ args, context }) {
      const conversation = await requireConversation(context);
      if (conversation.mode !== CONVERSATION_MODE.AI) {
        throw new ValidationError("Conversation is not in AI mode; a human owns the reply");
      }

      const contact = await requireContact(context);
      const text = String(args.text).trim();
      if (!text) throw new ValidationError("text cannot be empty");

      const { message } = await sendTextMessage({
        organizationId: context.organizationId,
        phoneNumberId: conversation.phoneNumberId,
        to: contact.waId,
        text,
      });

      return { messageId: message.id, status: message.status, text };
    },
  },
  {
    name: "handoff_to_human",
    description:
      "Stop the AI and hand this conversation to a human teammate. Use when the customer asks for a person, when you cannot help, or when the request is sensitive.",
    permission: "write",
    inputSchema: {
      type: "object",
      properties: { reason: { type: "string" } },
      additionalProperties: false,
    },
    async execute({ args, context }) {
      const conversation = await setConversationMode({
        organizationId: context.organizationId,
        conversationId: context.conversationId,
        mode: CONVERSATION_MODE.HUMAN,
      });

      await prisma.automationRun
        .create({
          data: {
            organizationId: context.organizationId,
            // Handoffs are recorded as events so the Logs page can explain them.
            automationId: await systemAutomationId(context.organizationId),
            conversationId: conversation.id,
            contactId: context.contactId,
            eventType: EVENT_TYPE.HUMAN_HANDOFF,
            status: "success",
            result: { reason: args.reason ?? "AI requested a handoff", actor: context.actor ?? "ai" },
            startedAt: new Date(),
            finishedAt: new Date(),
          },
        })
        .catch(() => null);

      await recordAudit({
        organizationId: context.organizationId,
        actorType: context.actor === "ai" ? "ai" : "user",
        action: "conversation.handoff",
        entityType: "Conversation",
        entityId: conversation.id,
        metadata: { reason: args.reason ?? null },
      });

      return {
        handedOff: true,
        mode: conversation.mode,
        reason: args.reason ?? "AI requested a handoff",
      };
    },
  },
];

/**
 * AutomationRun rows need an automation to hang off. Handoffs are not tied to a
 * user-defined automation, so the organization gets a hidden system row.
 */
async function systemAutomationId(organizationId) {
  const name = "[system] events";
  const existing = await prisma.automation.findUnique({
    where: { organizationId_name: { organizationId, name } },
  });
  if (existing) return existing.id;

  const created = await prisma.automation.upsert({
    where: { organizationId_name: { organizationId, name } },
    update: {},
    create: {
      organizationId,
      name,
      description: "Internal automation row that records system events such as human handoffs.",
      trigger: EVENT_TYPE.HUMAN_HANDOFF,
      isActive: false,
    },
  });

  return created.id;
}
