import { CONVERSATION_STATUS } from "../../lib/constants.js";
import { prisma } from "../../db/prisma.js";

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
