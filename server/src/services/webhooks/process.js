import { createHash } from "node:crypto";
import { logger } from "../../lib/logger.js";
import { isUniqueConstraintError, prisma } from "../../db/prisma.js";
import { upsertContact } from "../contacts/service.js";
import {
  findOrCreateConversation,
  recordConversationActivity,
} from "../conversations/service.js";
import {
  persistInboundMessage,
  updateMessageStatusByExternalId,
} from "../messages/service.js";
import { resolvePhoneNumberContext } from "../whatsapp/credentials.js";
import {
  deriveEventType,
  extractMessageChanges,
  normalizeInboundMessage,
  normalizeMessageStatus,
} from "./normalize.js";

/**
 * Webhook processing pipeline.
 *
 * 1. persist raw event (idempotent via payload hash)
 * 2. resolve tenant by phone_number_id
 * 3. normalize into internal events
 * 4. upsert contact + conversation, persist message / apply status
 *
 * No AI or automation runs here; those will be queued in later phases.
 */

export function hashWebhookPayload(rawBody) {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

export async function handleWhatsAppWebhook({ rawBody, payload, headers }) {
  const externalEventId = hashWebhookPayload(rawBody);

  let event;
  try {
    event = await prisma.webhookEvent.create({
      data: {
        source: "whatsapp",
        externalEventId,
        eventType: deriveEventType(payload),
        payload,
        headers: headers ?? undefined,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      logger.info("Duplicate webhook delivery ignored", { externalEventId });
      return { duplicate: true, processed: 0, errors: [] };
    }
    throw error;
  }

  const changes = extractMessageChanges(payload);
  const errors = [];
  let processed = 0;
  let organizationId = null;

  for (const change of changes) {
    const phoneNumber = await resolvePhoneNumberContext(change.phoneNumberId);
    if (!phoneNumber) {
      logger.warn("Webhook received for unknown phone number", {
        phoneNumberId: change.phoneNumberId,
        wabaId: change.wabaId,
      });
      continue;
    }

    organizationId ??= phoneNumber.organizationId;

    try {
      processed += await processChange({ phoneNumber, value: change.value });
    } catch (error) {
      errors.push(error.message);
      logger.error("Failed to process webhook change", {
        phoneNumberId: change.phoneNumberId,
        error: error.message,
      });
    }
  }

  const status = errors.length > 0 ? "failed" : processed > 0 ? "processed" : "ignored";
  await prisma.webhookEvent.update({
    where: { id: event.id },
    data: {
      organizationId,
      status,
      error: errors[0] ?? null,
      processedAt: new Date(),
    },
  });

  return { duplicate: false, processed, errors };
}

async function processChange({ phoneNumber, value }) {
  let processed = 0;

  for (const message of value.messages ?? []) {
    const result = await processInboundMessage({
      phoneNumber,
      message,
      contacts: value.contacts,
    });
    if (result) processed += 1;
  }

  for (const status of value.statuses ?? []) {
    const result = await processMessageStatus({ phoneNumber, status });
    if (result) processed += 1;
  }

  return processed;
}

export async function processInboundMessage({ phoneNumber, message, contacts }) {
  const organizationId = phoneNumber.organizationId;

  const normalized = normalizeInboundMessage({
    organizationId,
    phoneNumberId: phoneNumber.phoneNumberId,
    message,
    contacts,
  });

  const contact = await upsertContact({
    organizationId,
    waId: normalized.waId,
    profileName: normalized.profileName,
    phone: normalized.waId,
  });

  const { conversation, created } = await findOrCreateConversation({
    organizationId,
    contactId: contact.id,
    phoneNumberId: phoneNumber.id,
  });

  const persisted = await persistInboundMessage({
    organizationId,
    contactId: contact.id,
    conversationId: conversation.id,
    phoneNumberId: phoneNumber.id,
    normalized,
  });

  if (!persisted) {
    logger.info("Duplicate inbound message ignored", {
      externalMessageId: normalized.externalMessageId,
    });
    return null;
  }

  await recordConversationActivity(conversation.id, {
    preview: normalized.text,
    at: normalized.timestamp,
    incrementUnread: true,
  });

  return { message: persisted, conversation, contact, conversationCreated: created };
}

export async function processMessageStatus({ phoneNumber, status }) {
  const normalized = normalizeMessageStatus({
    organizationId: phoneNumber.organizationId,
    phoneNumberId: phoneNumber.phoneNumberId,
    status,
  });

  if (!normalized.status) return null;

  return updateMessageStatusByExternalId({
    externalMessageId: normalized.externalMessageId,
    status: normalized.status,
    timestamp: normalized.timestamp,
    error: normalized.error,
  });
}
