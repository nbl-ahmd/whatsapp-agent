import { AUTOMATION_ACTION, CONVERSATION_MODE } from "../../lib/constants.js";
import { logger } from "../../lib/logger.js";
import {
  addContactTag,
  removeContactTag,
} from "../contacts/service.js";
import {
  assignConversation,
  setConversationMode,
  setConversationVariables,
} from "../conversations/service.js";
import { sendTemplateMessage, sendTextMessage } from "../messages/outbound.js";
import { runAgentForConversation } from "../ai/agent.js";
import { prisma } from "../../db/prisma.js";

/**
 * Automation actions. Every action returns a small, serializable result object
 * that lands in `AutomationRun.result` and therefore on the Logs page.
 */

const MAX_INLINE_DELAY_MS = 5000;

/** `{{contact.name}}`-style templating so messages can be personalized. */
export function renderTemplate(text, context) {
  const replacements = {
    "{{contact.name}}": context.contact?.name ?? context.contact?.profileName ?? "there",
    "{{contact.phone}}": context.contact?.waId ?? "",
    "{{contact.email}}": context.contact?.email ?? "",
    "{{conversation.id}}": context.conversation?.id ?? "",
    "{{message.text}}": context.event?.text ?? "",
    "{{organization}}": context.organizationName ?? "our team",
  };

  let output = String(text ?? "");
  for (const [token, value] of Object.entries(replacements)) {
    output = output.split(token).join(value ?? "");
  }
  return output;
}

async function callWebhook(action, context) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(String(action.url), {
      method: (action.method ?? "POST").toUpperCase(),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: context.event?.type ?? null,
        organizationId: context.organizationId,
        contact: context.contact
          ? { id: context.contact.id, waId: context.contact.waId, tags: context.contact.tags }
          : null,
        conversation: context.conversation ? { id: context.conversation.id } : null,
        data: action.body ?? {},
      }),
      signal: controller.signal,
    });

    return { url: action.url, status: response.status, ok: response.ok };
  } catch (error) {
    return { url: action.url, ok: false, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Execute one action.
 *
 * @returns {Promise<{ type: string, ok: boolean, [key: string]: unknown }>}
 */
export async function executeAction(action, context) {
  const { organizationId, conversation, contact } = context;

  switch (action.type) {
    case AUTOMATION_ACTION.SEND_MESSAGE: {
      if (!conversation) return { type: action.type, ok: false, error: "no conversation in context" };
      const text = renderTemplate(action.text, context);
      const { message } = await sendTextMessage({
        organizationId,
        phoneNumberId: conversation.phoneNumberId,
        to: contact.waId,
        text,
      });
      return { type: action.type, ok: true, messageId: message.id, text };
    }

    case AUTOMATION_ACTION.SEND_TEMPLATE: {
      if (!conversation) return { type: action.type, ok: false, error: "no conversation in context" };
      const { message } = await sendTemplateMessage({
        organizationId,
        phoneNumberId: conversation.phoneNumberId,
        to: contact.waId,
        name: action.name,
        language: action.language ?? "en_US",
        components: action.components,
      });
      return { type: action.type, ok: true, messageId: message.id, template: action.name };
    }

    case AUTOMATION_ACTION.ADD_TAG:
      await addContactTag({ organizationId, contactId: contact.id, tag: action.tag });
      return { type: action.type, ok: true, tag: action.tag };

    case AUTOMATION_ACTION.REMOVE_TAG:
      await removeContactTag({ organizationId, contactId: contact.id, tag: action.tag });
      return { type: action.type, ok: true, tag: action.tag };

    case AUTOMATION_ACTION.ASSIGN_AGENT: {
      if (!conversation) return { type: action.type, ok: false, error: "no conversation in context" };
      await assignConversation({
        organizationId,
        conversationId: conversation.id,
        userId: action.userId ?? null,
      });
      return { type: action.type, ok: true, userId: action.userId ?? null };
    }

    case AUTOMATION_ACTION.SET_VARIABLE: {
      if (!conversation) return { type: action.type, ok: false, error: "no conversation in context" };
      await setConversationVariables({
        organizationId,
        conversationId: conversation.id,
        variables: { [action.key]: action.value },
      });
      return { type: action.type, ok: true, key: action.key, value: action.value };
    }

    case AUTOMATION_ACTION.HANDOFF_HUMAN: {
      if (!conversation) return { type: action.type, ok: false, error: "no conversation in context" };
      await setConversationMode({
        organizationId,
        conversationId: conversation.id,
        mode: CONVERSATION_MODE.HUMAN,
      });
      context.handoff = true;
      return { type: action.type, ok: true, note: action.note ?? null };
    }

    case AUTOMATION_ACTION.AI_AGENT: {
      if (!conversation) return { type: action.type, ok: false, error: "no conversation in context" };
      const result = await runAgentForConversation({
        organizationId,
        conversationId: conversation.id,
      });
      return { type: action.type, ok: true, replied: Boolean(result.replied), skipped: result.skipped ?? null };
    }

    case AUTOMATION_ACTION.DELAY: {
      const ms = Number(action.seconds) * 1000;
      if (ms > MAX_INLINE_DELAY_MS) {
        return {
          type: action.type,
          ok: true,
          deferred: true,
          seconds: Number(action.seconds),
          note: "Delays over 5s need the background queue driver; the run continued immediately.",
        };
      }
      await new Promise((resolve) => setTimeout(resolve, ms));
      return { type: action.type, ok: true, seconds: Number(action.seconds) };
    }

    case AUTOMATION_ACTION.WEBHOOK: {
      const result = await callWebhook(action, context);
      return { type: action.type, ok: Boolean(result.ok), ...result };
    }

    case AUTOMATION_ACTION.SEND_FLOW:
      return {
        type: action.type,
        ok: false,
        error: "WhatsApp Flows are not implemented yet (Phase 6)",
      };

    default:
      logger.warn("Unknown automation action", { type: action.type });
      return { type: action.type, ok: false, error: `unsupported action ${action.type}` };
  }
}

/** Load the organization name once per run for templating. */
export async function organizationName(organizationId) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });
  return organization?.name ?? null;
}
