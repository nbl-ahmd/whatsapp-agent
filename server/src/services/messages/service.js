import { MESSAGE_STATUS, MESSAGE_STATUS_RANK } from "../../lib/constants.js";
import { isUniqueConstraintError, prisma } from "../../db/prisma.js";

/**
 * Persist an inbound message. Returns `null` when the message was already
 * stored (duplicate webhook delivery), which keeps processing idempotent.
 */
export async function persistInboundMessage({
  organizationId,
  contactId,
  conversationId,
  phoneNumberId,
  normalized,
}) {
  try {
    return await prisma.message.create({
      data: {
        organizationId,
        contactId,
        conversationId,
        phoneNumberId,
        direction: "inbound",
        type: normalized.type,
        status: MESSAGE_STATUS.RECEIVED,
        externalMessageId: normalized.externalMessageId,
        text: normalized.text ?? undefined,
        media: normalized.media ?? undefined,
        interactive: normalized.interactive ?? undefined,
        location: normalized.location ?? undefined,
        context: normalized.context ?? undefined,
        timestamp: normalized.timestamp,
        raw: normalized.raw,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return null;
    throw error;
  }
}

export async function persistOutboundMessage({
  organizationId,
  contactId,
  conversationId,
  phoneNumberId,
  type = "text",
  text,
  media,
  template,
  status = MESSAGE_STATUS.QUEUED,
}) {
  return prisma.message.create({
    data: {
      organizationId,
      contactId,
      conversationId,
      phoneNumberId,
      direction: "outbound",
      type,
      status,
      text: text ?? undefined,
      media: media ?? undefined,
      template: template ?? undefined,
      timestamp: new Date(),
    },
  });
}

export async function markMessageSent(id, externalMessageId) {
  return prisma.message.update({
    where: { id },
    data: {
      status: MESSAGE_STATUS.SENT,
      externalMessageId: externalMessageId ?? undefined,
      sentAt: new Date(),
    },
  });
}

export async function markMessageFailed(id, error) {
  return prisma.message.update({
    where: { id },
    data: {
      status: MESSAGE_STATUS.FAILED,
      error: typeof error === "string" ? error : JSON.stringify(error),
    },
  });
}

/**
 * Apply a status webhook (sent/delivered/read/failed). Delivery states are
 * monotonic: an out-of-order `delivered` will not downgrade a `read` message.
 */
export async function updateMessageStatusByExternalId({
  externalMessageId,
  status,
  timestamp,
  error,
}) {
  const message = await prisma.message.findUnique({ where: { externalMessageId } });
  if (!message) return null;

  if (status !== MESSAGE_STATUS.FAILED) {
    const currentRank = MESSAGE_STATUS_RANK[message.status] ?? -1;
    const nextRank = MESSAGE_STATUS_RANK[status] ?? -1;
    if (nextRank <= currentRank) return message;
  }

  return prisma.message.update({
    where: { id: message.id },
    data: {
      status,
      error:
        status === MESSAGE_STATUS.FAILED
          ? error
            ? typeof error === "string"
              ? error
              : JSON.stringify(error)
            : "Message failed"
          : undefined,
      sentAt:
        status === MESSAGE_STATUS.SENT && !message.sentAt
          ? (timestamp ?? new Date())
          : undefined,
    },
  });
}

/**
 * Newest N messages for a thread, returned oldest-first for rendering.
 *
 * Querying ascending with a limit would return the *oldest* page, so a long
 * conversation would never show the latest reply. Fetch descending, then
 * reverse the page.
 */
export async function listConversationMessages({
  organizationId,
  conversationId,
  take = 50,
  before = null,
}) {
  const rows = await prisma.message.findMany({
    where: {
      organizationId,
      conversationId,
      ...(before ? { timestamp: { lt: before } } : {}),
    },
    orderBy: { timestamp: "desc" },
    take,
  });

  return rows.reverse();
}
