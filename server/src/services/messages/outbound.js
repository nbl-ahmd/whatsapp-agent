import { NotFoundError } from "../../lib/errors.js";
import { upsertContact } from "../contacts/service.js";
import { findOrCreateConversation, recordConversationActivity } from "../conversations/service.js";
import { resolveAccessToken, resolvePhoneNumberContext } from "../whatsapp/credentials.js";
import { sendText as sendWhatsAppText } from "../whatsapp/service.js";
import { markMessageFailed, markMessageSent, persistOutboundMessage } from "./service.js";

/**
 * Single outbound messaging abstraction. Persists the message first, then sends
 * it through the WhatsApp provider, then records the delivery state. All
 * outbound sends (inbox, automation, AI) must go through here.
 */
export async function sendTextMessage({ organizationId, phoneNumberId, to, text, previewUrl }) {
  const context = await resolvePhoneNumberContext(phoneNumberId);
  if (!context || context.organizationId !== organizationId) {
    throw new NotFoundError("WhatsApp phone number not found for this organization");
  }

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
    type: "text",
    text,
  });

  try {
    const { externalMessageId, response } = await sendWhatsAppText({
      phoneNumberId,
      accessToken,
      to,
      text,
      previewUrl,
    });

    const sent = await markMessageSent(message.id, externalMessageId);
    await recordConversationActivity(conversation.id, {
      preview: text,
      at: new Date(),
      resetUnread: true,
    });

    return { message: sent, contact, conversation, providerResponse: response };
  } catch (error) {
    await markMessageFailed(message.id, error.message);
    throw error;
  }
}
