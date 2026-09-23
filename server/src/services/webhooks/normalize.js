import {
  CHANNEL,
  EVENT_TYPE,
  MESSAGE_STATUS,
  MESSAGE_TYPE,
} from "../../lib/constants.js";

/**
 * Translate raw Meta webhook payloads into the internal, provider-neutral event
 * model. Normalization is pure: no database access, so it is easy to test.
 *
 * Normalized inbound message:
 * {
 *   organizationId, channel, phoneNumberId, contactId, conversationId,
 *   externalMessageId, type, text, media, interactive, timestamp, raw
 * }
 */

const TYPE_MAP = {
  text: MESSAGE_TYPE.TEXT,
  image: MESSAGE_TYPE.IMAGE,
  document: MESSAGE_TYPE.DOCUMENT,
  audio: MESSAGE_TYPE.AUDIO,
  video: MESSAGE_TYPE.VIDEO,
  sticker: MESSAGE_TYPE.STICKER,
  location: MESSAGE_TYPE.LOCATION,
  contacts: MESSAGE_TYPE.CONTACTS,
  interactive: MESSAGE_TYPE.INTERACTIVE,
  button: MESSAGE_TYPE.INTERACTIVE,
  template: MESSAGE_TYPE.TEMPLATE,
  flow: MESSAGE_TYPE.FLOW,
};

const STATUS_MAP = {
  sent: MESSAGE_STATUS.SENT,
  delivered: MESSAGE_STATUS.DELIVERED,
  read: MESSAGE_STATUS.READ,
  failed: MESSAGE_STATUS.FAILED,
};

const MEDIA_TYPES = ["image", "document", "audio", "video", "sticker"];

function toDate(timestamp) {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date();
}

export function mapMessageType(metaType) {
  return TYPE_MAP[metaType] ?? MESSAGE_TYPE.UNKNOWN;
}

export function mapStatus(metaStatus) {
  return STATUS_MAP[metaStatus] ?? null;
}

export function extractMedia(message) {
  for (const type of MEDIA_TYPES) {
    if (message?.[type]) return { type, ...message[type] };
  }
  return null;
}

function extractText(message) {
  return (
    message?.text?.body ??
    message?.button?.text ??
    message?.interactive?.button_reply?.title ??
    message?.interactive?.list_reply?.title ??
    null
  );
}

/**
 * Flatten a webhook payload into message changes carrying the phone number id
 * used for tenant resolution.
 */
export function extractMessageChanges(payload) {
  const changes = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field && change.field !== "messages") continue;
      changes.push({
        wabaId: entry.id ?? null,
        phoneNumberId: change.value?.metadata?.phone_number_id ?? null,
        value: change.value ?? {},
      });
    }
  }
  return changes;
}

export function deriveEventType(payload) {
  for (const change of extractMessageChanges(payload)) {
    if ((change.value.messages?.length ?? 0) > 0) return EVENT_TYPE.MESSAGE_RECEIVED;
    if ((change.value.statuses?.length ?? 0) > 0) return EVENT_TYPE.MESSAGE_STATUS;
  }
  return null;
}

export function normalizeInboundMessage({ organizationId, phoneNumberId, message, contacts }) {
  const profile = contacts?.find((contact) => contact.wa_id === message.from) ?? contacts?.[0];

  return {
    kind: "message",
    organizationId,
    channel: CHANNEL.WHATSAPP,
    phoneNumberId,
    externalMessageId: message.id,
    waId: message.from,
    profileName: profile?.profile?.name ?? null,
    type: mapMessageType(message.type),
    text: extractText(message),
    media: extractMedia(message),
    interactive: message.interactive ?? null,
    location: message.location ?? null,
    context: message.context ?? null,
    timestamp: toDate(message.timestamp),
    raw: message,
  };
}

export function normalizeMessageStatus({ organizationId, phoneNumberId, status }) {
  return {
    kind: "status",
    organizationId,
    channel: CHANNEL.WHATSAPP,
    phoneNumberId,
    externalMessageId: status.id,
    status: mapStatus(status.status),
    recipientId: status.recipient_id ?? null,
    conversationCategory: status.conversation?.category ?? null,
    error: status.errors?.[0] ?? null,
    timestamp: toDate(status.timestamp),
    raw: status,
  };
}
