import { randomUUID } from "node:crypto";
import { NotFoundError } from "../../lib/errors.js";
import { upsertContact } from "../contacts/service.js";
import { findOrCreateConversation, recordConversationActivity } from "../conversations/service.js";
import { resolveAccessToken, resolvePhoneNumberContext } from "../whatsapp/credentials.js";
import {
  sendTemplate as sendWhatsAppTemplate,
  sendText as sendWhatsAppText,
} from "../whatsapp/service.js";
import { markMessageFailed, markMessageSent, persistOutboundMessage } from "./service.js";

/**
 * Single outbound messaging abstraction. Persists the message first, then sends
 * it through the WhatsApp provider, then records the delivery state. All
 * outbound sends (inbox, automation, AI) must go through here.
 *
 * The provider is chosen per phone number: "meta" calls the Graph API,
 * "simulator" records the message and returns a fake provider id so the whole
 * pipeline can be exercised locally without Meta credentials.
 */

export const PROVIDER_MODE = Object.freeze({ META: "meta", SIMULATOR: "simulator" });

async function resolveContext({ organizationId, phoneNumberId }) {
  const context = await resolvePhoneNumberContext(phoneNumberId);
  if (!context || context.organizationId !== organizationId) {
    throw new NotFoundError("WhatsApp phone number not found for this organization");
  }
  return context;
}

function simulateDelivery(context) {
  return {
    externalMessageId: `sim_${randomUUID()}`,
    response: {
      simulator: true,
      phoneNumberId: context.phoneNumberId,
      deliveredAt: new Date().toISOString(),
    },
  };
}

/**
 * Shared delivery path for every outbound type.
 */
async function deliver({ organizationId, phoneNumberId, to, type, text, template, send }) {
  const context = await resolveContext({ organizationId, phoneNumberId });
  const accessToken = resolveAccessToken(context.whatsappAccount);

  const contact = await upsertContact({ organizationId, waId: to, phone: to });
  const { conversation } = await findOrCreateConversation({
    organizationId,
    contactId: contact.id,
    phoneNumberId: context.id,
  });

  const message = await persistOutboundMessage({
    organizationId,
    contactId: contact.id,
    conversationId: conversation.id,
    phoneNumberId: context.id,
    type,
    text,
    template,
  });

  try {
    const { externalMessageId, response } =
      context.providerMode === PROVIDER_MODE.SIMULATOR
        ? simulateDelivery(context)
        : await send({ accessToken: accessToken ?? null, phoneNumberId, to });

    const sent = await markMessageSent(message.id, externalMessageId);
    await recordConversationActivity(conversation.id, {
      preview: text ?? (template ? `Template: ${template.name}` : undefined),
      at: new Date(),
      resetUnread: true,
    });

    return { message: sent, contact, conversation, providerResponse: response };
  } catch (error) {
    await markMessageFailed(message.id, error.message);
    throw error;
  }
}

export async function sendTextMessage({ organizationId, phoneNumberId, to, text, previewUrl }) {
  return deliver({
    organizationId,
    phoneNumberId,
    to,
    type: "text",
    text,
    send: ({ accessToken, phoneNumberId: id, to: recipient }) =>
      sendWhatsAppText({ phoneNumberId: id, accessToken, to: recipient, text, previewUrl }),
  });
}

export async function sendTemplateMessage({
  organizationId,
  phoneNumberId,
  to,
  name,
  language,
  components,
}) {
  return deliver({
    organizationId,
    phoneNumberId,
    to,
    type: "template",
    template: { name, language, components: components ?? null },
    send: ({ accessToken, phoneNumberId: id, to: recipient }) =>
      sendWhatsAppTemplate({
        phoneNumberId: id,
        accessToken,
        to: recipient,
        name,
        language,
        components,
      }),
  });
}
