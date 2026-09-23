/**
 * Shared domain constants. These are provider-neutral: Meta-specific values are
 * translated into this vocabulary inside the whatsapp integration layer.
 */

export const CHANNEL = Object.freeze({
  WHATSAPP: "whatsapp",
});

export const CONVERSATION_MODE = Object.freeze({
  AI: "ai",
  HUMAN: "human",
  PAUSED: "paused",
});

export const CONVERSATION_STATUS = Object.freeze({
  OPEN: "open",
  PENDING: "pending",
  CLOSED: "closed",
});

export const MESSAGE_DIRECTION = Object.freeze({
  INBOUND: "inbound",
  OUTBOUND: "outbound",
});

export const MESSAGE_TYPE = Object.freeze({
  TEXT: "text",
  IMAGE: "image",
  DOCUMENT: "document",
  AUDIO: "audio",
  VIDEO: "video",
  STICKER: "sticker",
  LOCATION: "location",
  CONTACTS: "contacts",
  INTERACTIVE: "interactive",
  TEMPLATE: "template",
  FLOW: "flow",
  UNKNOWN: "unknown",
});

export const MESSAGE_STATUS = Object.freeze({
  QUEUED: "queued",
  SENT: "sent",
  DELIVERED: "delivered",
  READ: "read",
  FAILED: "failed",
  RECEIVED: "received",
});

/**
 * Monotonic ordering of outbound delivery states. Status webhooks may arrive
 * out of order, so a message is never downgraded (e.g. read -> delivered).
 */
export const MESSAGE_STATUS_RANK = Object.freeze({
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
});

export const EVENT_TYPE = Object.freeze({
  MESSAGE_RECEIVED: "MESSAGE_RECEIVED",
  MESSAGE_SENT: "MESSAGE_SENT",
  MESSAGE_STATUS: "MESSAGE_STATUS",
  CONVERSATION_STARTED: "CONVERSATION_STARTED",
  FLOW_COMPLETED: "FLOW_COMPLETED",
  ORDER_CREATED: "ORDER_CREATED",
  ORDER_UPDATED: "ORDER_UPDATED",
  HUMAN_HANDOFF: "HUMAN_HANDOFF",
});

export const AUTOMATION_ACTION = Object.freeze({
  SEND_MESSAGE: "send_message",
  SEND_TEMPLATE: "send_template",
  SEND_FLOW: "send_flow",
  AI_AGENT: "ai_agent",
  ADD_TAG: "add_tag",
  REMOVE_TAG: "remove_tag",
  ASSIGN_AGENT: "assign_agent",
  SET_VARIABLE: "set_variable",
  WEBHOOK: "webhook",
  DELAY: "delay",
  HANDOFF_HUMAN: "handoff_human",
});

export const AUTOMATION_CONDITION = Object.freeze({
  CONTAINS: "contains",
  EQUALS: "equals",
  STARTS_WITH: "starts_with",
  VARIABLE_EQUALS: "variable_equals",
  CONTACT_TAG: "contact_tag",
  AI_INTENT: "ai_intent",
});

export const QUEUE_TOPIC = Object.freeze({
  WEBHOOK_EVENT: "webhook.event",
  AUTOMATION_RUN: "automation.run",
  OUTBOUND_MESSAGE: "outbound.message",
});
