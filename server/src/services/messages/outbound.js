import { randomUUID } from "node:crypto";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { upsertContact } from "../contacts/service.js";
import { findOrCreateConversation, recordConversationActivity } from "../conversations/service.js";
import { getMetaConfig } from "../settings/index.js";
import { resolveAccessToken, resolvePhoneNumberContext } from "../whatsapp/credentials.js";
import {
  sendDocument as sendWhatsAppDocument,
  sendImage as sendWhatsAppImage,
  sendInteractive as sendWhatsAppInteractive,
  sendTemplate as sendWhatsAppTemplate,
  sendText as sendWhatsAppText,
} from "../whatsapp/service.js";
import { markMessageFailed, markMessageSent, persistOutboundMessage } from "./service.js";

/**
 * Single outbound messaging abstraction. Persists the message first, then sends
 * it through the WhatsApp provider, then records the delivery state. All
 * outbound sends (inbox, automation, AI, WhatsApp page) must go through here.
 *
 * The provider is chosen per phone number: "meta" calls the Graph API,
 * "simulator" records the message and returns a fake provider id so the whole
 * pipeline can be exercised locally without Meta credentials.
 */

export const PROVIDER_MODE = Object.freeze({ META: "meta", SIMULATOR: "simulator" });

export const MESSAGE_TYPES = Object.freeze([
  "text",
  "image",
  "document",
  "template",
  "interactive",
]);

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
async function deliver({
  organizationId,
  phoneNumberId,
  to,
  type,
  text,
  media,
  template,
  interactive,
  send,
}) {
  const context = await resolveContext({ organizationId, phoneNumberId });
  const meta = await getMetaConfig({ organizationId });
  const accessToken = resolveAccessToken(context.whatsappAccount, meta.accessToken);

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
    media,
    template,
  });

  try {
    const { externalMessageId, response } =
      context.providerMode === PROVIDER_MODE.SIMULATOR
        ? simulateDelivery(context)
        : await send({
            accessToken: accessToken ?? null,
            phoneNumberId,
            to,
            baseUrl: meta.graphApiBaseUrl,
            version: meta.graphApiVersion,
          });

    const sent = await markMessageSent(message.id, externalMessageId);
    await recordConversationActivity(conversation.id, {
      preview:
        text ??
        media?.caption ??
        media?.filename ??
        (template ? `Template: ${template.name}` : `[${type}]`),
      at: new Date(),
      resetUnread: true,
    });

    return { message: sent, contact, conversation, providerResponse: response };
  } catch (error) {
    await markMessageFailed(message.id, error.message);
    throw error;
  }
}

function requireText(text) {
  const body = String(text ?? "").trim();
  if (!body) throw new ValidationError("Message text is required");
  if (body.length > 4096) throw new ValidationError("Message text must be at most 4096 characters");
  return body;
}

function requireMedia(media, type) {
  const source = media ?? {};
  const link = source.link ? String(source.link).trim() : null;
  const id = source.id ? String(source.id).trim() : null;
  if (!link && !id) {
    throw new ValidationError(`${type} requires a media link or a media id`);
  }
  return {
    link,
    id,
    caption: source.caption ? String(source.caption).slice(0, 1024) : null,
    filename: source.filename ? String(source.filename).slice(0, 240) : null,
  };
}

/**
 * Send any supported message type through the one delivery path.
 *
 * @param {{
 *   organizationId: string,
 *   phoneNumberId: string,
 *   to: string,
 *   type?: "text"|"image"|"document"|"template"|"interactive",
 *   text?: string,
 *   previewUrl?: boolean,
 *   media?: { link?: string, id?: string, caption?: string, filename?: string },
 *   template?: { name: string, language?: string, components?: unknown[] },
 *   interactive?: object,
 * }} params
 */
export async function sendMessage({
  organizationId,
  phoneNumberId,
  to,
  type = "text",
  text,
  previewUrl = false,
  media,
  template,
  interactive,
}) {
  const recipient = String(to ?? "").trim();
  if (!recipient) throw new ValidationError("Recipient (to) is required");

  switch (type) {
    case "text": {
      const body = requireText(text);
      return deliver({
        organizationId,
        phoneNumberId,
        to: recipient,
        type,
        text: body,
        send: ({ accessToken, phoneNumberId: id, to: target, baseUrl, version }) =>
          sendWhatsAppText({
            phoneNumberId: id,
            accessToken,
            to: target,
            text: body,
            previewUrl,
            baseUrl,
            version,
          }),
      });
    }

    case "image":
    case "document": {
      const payload = requireMedia(media, type);
      return deliver({
        organizationId,
        phoneNumberId,
        to: recipient,
        type,
        text: payload.caption ?? undefined,
        media: payload,
        send: ({ accessToken, phoneNumberId: id, to: target, baseUrl, version }) =>
          type === "image"
            ? sendWhatsAppImage({
                phoneNumberId: id,
                accessToken,
                to: target,
                link: payload.link,
                id: payload.id,
                caption: payload.caption,
                baseUrl,
                version,
              })
            : sendWhatsAppDocument({
                phoneNumberId: id,
                accessToken,
                to: target,
                link: payload.link,
                id: payload.id,
                filename: payload.filename,
                caption: payload.caption,
                baseUrl,
                version,
              }),
      });
    }

    case "template": {
      const name = String(template?.name ?? "").trim();
      if (!name) throw new ValidationError("template.name is required");
      const language = String(template?.language ?? "en_US").trim();
      const components = Array.isArray(template?.components) ? template.components : undefined;
      const stored = { name, language, components: components ?? null };

      return deliver({
        organizationId,
        phoneNumberId,
        to: recipient,
        type,
        template: stored,
        send: ({ accessToken, phoneNumberId: id, to: target, baseUrl, version }) =>
          sendWhatsAppTemplate({
            phoneNumberId: id,
            accessToken,
            to: target,
            name,
            language,
            components,
            baseUrl,
            version,
          }),
      });
    }

    case "interactive": {
      if (!interactive || typeof interactive !== "object" || Array.isArray(interactive)) {
        throw new ValidationError("interactive must be an object");
      }
      return deliver({
        organizationId,
        phoneNumberId,
        to: recipient,
        type,
        text: typeof interactive.body?.text === "string" ? interactive.body.text : undefined,
        interactive,
        send: ({ accessToken, phoneNumberId: id, to: target, baseUrl, version }) =>
          sendWhatsAppInteractive({
            phoneNumberId: id,
            accessToken,
            to: target,
            interactive,
            baseUrl,
            version,
          }),
      });
    }

    default:
      throw new ValidationError(`type must be one of: ${MESSAGE_TYPES.join(", ")}`);
  }
}

export function sendTextMessage({ organizationId, phoneNumberId, to, text, previewUrl }) {
  return sendMessage({ organizationId, phoneNumberId, to, type: "text", text, previewUrl });
}

export function sendTemplateMessage({
  organizationId,
  phoneNumberId,
  to,
  name,
  language,
  components,
}) {
  return sendMessage({
    organizationId,
    phoneNumberId,
    to,
    type: "template",
    template: { name, language, components },
  });
}

/**
 * Build the `components` array for sending a template that has a FLOW button.
 * The parameter goes on the button, not the body, which is the part most
 * hand-written payloads get wrong.
 */
export function buildFlowTemplateComponents({
  flowToken = "unused",
  flowActionData,
  buttonIndex = 0,
}) {
  return [
    {
      type: "button",
      sub_type: "flow",
      index: String(buttonIndex),
      parameters: [
        {
          type: "action",
          action: {
            ...(flowToken ? { flow_token: String(flowToken) } : {}),
            ...(flowActionData !== undefined && flowActionData !== null
              ? {
                  flow_action_data:
                    typeof flowActionData === "string"
                      ? JSON.parse(flowActionData)
                      : flowActionData,
                }
              : {}),
          },
        },
      ],
    },
  ];
}

/**
 * Send a Flow through a template. This is the path a Meta test number can use:
 * test numbers only accept template messages outside a customer service window.
 */
export function sendFlowTemplateMessage({
  organizationId,
  phoneNumberId,
  to,
  name,
  language = "en_US",
  flowToken = "unused",
  flowActionData,
  buttonIndex = 0,
}) {
  return sendMessage({
    organizationId,
    phoneNumberId,
    to,
    type: "template",
    template: {
      name,
      language,
      components: buildFlowTemplateComponents({ flowToken, flowActionData, buttonIndex }),
    },
  });
}

/**
 * Send an interactive Flow message (open the Flow from a CTA). Only works inside
 * the 24-hour customer service window; business-initiated sends must use
 * `sendFlowTemplateMessage`.
 */
export function sendFlowMessage({
  organizationId,
  phoneNumberId,
  to,
  flowId,
  flowName,
  flowCta = "Open",
  flowToken = "unused",
  flowAction = "navigate",
  flowActionPayload,
  mode = "published",
  headerText,
  bodyText,
  footerText,
}) {
  if (!flowId && !flowName) {
    throw new ValidationError("flowId or flowName is required");
  }

  const interactive = {
    type: "flow",
    ...(headerText ? { header: { type: "text", text: String(headerText) } } : {}),
    ...(bodyText ? { body: { text: String(bodyText) } } : {}),
    ...(footerText ? { footer: { text: String(footerText) } } : {}),
    action: {
      name: "flow",
      parameters: {
        flow_message_version: "3",
        flow_cta: String(flowCta),
        flow_token: String(flowToken),
        mode,
        ...(flowId ? { flow_id: String(flowId) } : { flow_name: String(flowName) }),
        flow_action: flowAction,
        ...(flowActionPayload
          ? {
              flow_action_payload:
                typeof flowActionPayload === "string"
                  ? JSON.parse(flowActionPayload)
                  : flowActionPayload,
            }
          : {}),
      },
    },
  };

  return sendMessage({
    organizationId,
    phoneNumberId,
    to,
    type: "interactive",
    interactive,
  });
}

