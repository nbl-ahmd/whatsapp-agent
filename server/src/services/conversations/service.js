import { CONVERSATION_MODE, CONVERSATION_STATUS } from "../../lib/constants.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { prisma } from "../../db/prisma.js";

/**
 * Conversation lifecycle. A conversation is owned by exactly one responder at a
 * time (`ai` | `human` | `paused`); switching to `human` is what stops the AI.
 */

/**
 * Find the open conversation for a contact + phone number, or create one.
 * Conversations are tenant-scoped.
 */
export async function findOrCreateConversation({ organizationId, contactId, phoneNumberId }) {
  const existing = await prisma.conversation.findFirst({
    where: {
      organizationId,
      contactId,
      phoneNumberId,
      status: { not: CONVERSATION_STATUS.CLOSED },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) return { conversation: existing, created: false };

  const conversation = await prisma.conversation.create({
    data: { organizationId, contactId, phoneNumberId },
  });
  return { conversation, created: true };
}

/**
 * Update denormalized conversation activity after a message is persisted.
 */
export async function recordConversationActivity(
  conversationId,
  { preview, at, incrementUnread = false, resetUnread = false } = {},
) {
  return prisma.conversation.update({
    where: { id: conversationId },
    data: {
      lastMessageAt: at ?? new Date(),
      lastMessagePreview: preview ? String(preview).slice(0, 160) : undefined,
      unreadCount: resetUnread ? 0 : incrementUnread ? { increment: 1 } : undefined,
    },
  });
}

export function getConversation({ organizationId, conversationId }) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, organizationId },
  });
}

/** Conversation plus the records the inbox needs to render a thread header. */
export async function getConversationDetail({ organizationId, conversationId }) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId },
    include: {
      contact: true,
      phoneNumber: true,
      assignedUser: { select: { id: true, name: true, email: true } },
    },
  });

  if (!conversation) throw new NotFoundError("Conversation not found");
  return conversation;
}

export async function listConversations({
  organizationId,
  status,
  mode,
  search = null,
  assignedUserId = null,
  unreadOnly = false,
  take = 50,
}) {
  const where = { organizationId };

  if (status) where.status = status;
  if (mode) where.mode = mode;
  if (unreadOnly) where.unreadCount = { gt: 0 };
  if (assignedUserId) where.assignedUserId = assignedUserId;

  if (search) {
    where.OR = [
      { contact: { name: { contains: search, mode: "insensitive" } } },
      { contact: { profileName: { contains: search, mode: "insensitive" } } },
      { contact: { waId: { contains: search } } },
      { lastMessagePreview: { contains: search, mode: "insensitive" } },
    ];
  }

  return prisma.conversation.findMany({
    where,
    include: {
      contact: {
        select: { id: true, name: true, profileName: true, waId: true, tags: true },
      },
      assignedUser: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    take,
  });
}

/**
 * Switch the active responder. This is the control that makes AI and humans
 * mutually exclusive for a conversation.
 */
export async function setConversationMode({ organizationId, conversationId, mode, userId = null }) {
  if (!Object.values(CONVERSATION_MODE).includes(mode)) {
    throw new ValidationError(`mode must be one of: ${Object.values(CONVERSATION_MODE).join(", ")}`);
  }

  const conversation = await getConversation({ organizationId, conversationId });
  if (!conversation) throw new NotFoundError("Conversation not found");

  const data = { mode };

  // Taking over is itself a status event: the conversation is being worked on.
  if (mode === CONVERSATION_MODE.HUMAN) {
    data.status = CONVERSATION_STATUS.PENDING;
    data.unreadCount = 0;
    if (userId) data.assignedUserId = conversation.assignedUserId ?? userId;
  }

  return prisma.conversation.update({ where: { id: conversation.id }, data });
}

export async function assignConversation({ organizationId, conversationId, userId }) {
  const conversation = await getConversation({ organizationId, conversationId });
  if (!conversation) throw new NotFoundError("Conversation not found");

  if (userId) {
    const user = await prisma.user.findFirst({ where: { id: userId, organizationId } });
    if (!user) throw new NotFoundError("Team member not found");
  }

  return prisma.conversation.update({
    where: { id: conversation.id },
    data: { assignedUserId: userId ?? null },
  });
}

export async function setConversationStatus({ organizationId, conversationId, status }) {
  if (!Object.values(CONVERSATION_STATUS).includes(status)) {
    throw new ValidationError(
      `status must be one of: ${Object.values(CONVERSATION_STATUS).join(", ")}`,
    );
  }

  const conversation = await getConversation({ organizationId, conversationId });
  if (!conversation) throw new NotFoundError("Conversation not found");

  return prisma.conversation.update({
    where: { id: conversation.id },
    data: { status, ...(status === CONVERSATION_STATUS.CLOSED ? { mode: CONVERSATION_MODE.PAUSED } : {}) },
  });
}

export async function markConversationRead({ organizationId, conversationId }) {
  const conversation = await getConversation({ organizationId, conversationId });
  if (!conversation) throw new NotFoundError("Conversation not found");

  if (conversation.unreadCount === 0) return conversation;
  return prisma.conversation.update({
    where: { id: conversation.id },
    data: { unreadCount: 0 },
  });
}

/** Merge workflow/AI variables onto the conversation (used by set_variable). */
export async function setConversationVariables({ organizationId, conversationId, variables }) {
  const conversation = await getConversation({ organizationId, conversationId });
  if (!conversation) throw new NotFoundError("Conversation not found");

  const current =
    conversation.variables && typeof conversation.variables === "object" ? conversation.variables : {};

  return prisma.conversation.update({
    where: { id: conversation.id },
    data: { variables: { ...current, ...variables } },
  });
}
