import { CONVERSATION_MODE } from "../../lib/constants.js";
import { recordAudit } from "../../lib/audit.js";
import { ValidationError } from "../../lib/errors.js";
import { getConversationDetail, markConversationRead, setConversationMode } from "../conversations/service.js";
import { sendTextMessage } from "./outbound.js";

/**
 * A human reply from the inbox.
 *
 * Replying is a take-over: the conversation switches to `human` mode in the same
 * call, so the AI cannot answer over the top of a teammate.
 */
export async function replyToConversation({ organizationId, conversationId, userId, text, req = null }) {
  const conversation = await getConversationDetail({ organizationId, conversationId });

  const body = String(text ?? "").trim();
  if (!body) throw new ValidationError("Message text is required");
  if (body.length > 4096) throw new ValidationError("Message text must be at most 4096 characters");

  const { message } = await sendTextMessage({
    organizationId,
    phoneNumberId: conversation.phoneNumberId,
    to: conversation.contact.waId,
    text: body,
  });

  await setConversationMode({
    organizationId,
    conversationId,
    mode: CONVERSATION_MODE.HUMAN,
    userId,
  });
  await markConversationRead({ organizationId, conversationId });

  await recordAudit({
    organizationId,
    userId,
    action: "conversation.replied",
    entityType: "Conversation",
    entityId: conversationId,
    metadata: { messageId: message.id, mode: "human" },
    req,
  });

  return { message, conversationId };
}
