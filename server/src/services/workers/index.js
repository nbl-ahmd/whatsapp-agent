import { EVENT_TYPE, QUEUE_TOPIC } from "../../lib/constants.js";
import { logger } from "../../lib/logger.js";
import { queue } from "../../lib/queue.js";
import { handleInboundWithAgent } from "../ai/agent.js";
import { runAutomationsForEvent } from "../automation/engine.js";

/**
 * Background processing.
 *
 * The webhook request only persists and enqueues; everything slow (automations,
 * AI inference, outbound sends) happens here. The default driver is in-process,
 * so `startWorkers()` is all that a single-node deployment needs. Swapping in a
 * Redis/BullMQ driver later does not change any caller.
 */

export const descriptor = Object.freeze({
  name: "workers",
  phase: 4,
  description: "Background queue consumers.",
});

/**
 * Queue an inbound event for automation + AI processing.
 * @param {{ organizationId: string, type: string, conversationId: string|null, contactId: string|null, messageId?: string|null, text?: string|null, conversationCreated?: boolean }} event
 */
export async function enqueueInboundEvent(event) {
  const jobs = [];

  if (event.conversationCreated) {
    jobs.push(
      queue.enqueue(QUEUE_TOPIC.WEBHOOK_EVENT, {
        ...event,
        type: EVENT_TYPE.CONVERSATION_STARTED,
        text: null,
      }),
    );
  }

  jobs.push(queue.enqueue(QUEUE_TOPIC.WEBHOOK_EVENT, event));
  await Promise.all(jobs);
}

/**
 * Runs automations for the event, then lets the AI answer - unless an
 * automation already replied or handed the conversation to a human, in which
 * case exactly one responder has acted.
 */
export async function processInboundEvent(event) {
  const automated = await runAutomationsForEvent({
    organizationId: event.organizationId,
    event: {
      type: event.type,
      text: event.text ?? null,
      conversationId: event.conversationId ?? null,
      contactId: event.contactId ?? null,
      messageId: event.messageId ?? null,
      tags: event.tags ?? [],
    },
  });

  if (automated.handoff || automated.messaged) {
    logger.info("Skipping AI reply: automation already acted", {
      conversationId: event.conversationId,
      handoff: automated.handoff,
      messaged: automated.messaged,
    });
    return { automations: automated, ai: { skipped: "automation-acted" } };
  }

  // The AI answers messages, not lifecycle events: replying to
  // CONVERSATION_STARTED as well would double up with the actual message.
  if (event.type !== EVENT_TYPE.MESSAGE_RECEIVED) {
    return { automations: automated, ai: { skipped: "not-a-message-event" } };
  }

  const ai = await handleInboundWithAgent({
    organizationId: event.organizationId,
    conversationId: event.conversationId,
    messageId: event.messageId ?? null,
  });

  return { automations: automated, ai };
}

/** Register handlers. Safe to call once per process. */
export function startWorkers() {
  queue.register(QUEUE_TOPIC.WEBHOOK_EVENT, async (payload) => {
    try {
      await processInboundEvent(payload);
    } catch (error) {
      logger.error("Inbound event processing failed", {
        organizationId: payload?.organizationId,
        error: error?.message,
      });
    }
  });

  return { driver: "memory", topics: [QUEUE_TOPIC.WEBHOOK_EVENT] };
}
