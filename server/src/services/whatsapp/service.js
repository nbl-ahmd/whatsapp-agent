import * as metaClient from "./meta-client.js";

/**
 * Provider-neutral WhatsApp outbound interface. Meta specifics stay in
 * `meta-client.js`; callers use these functions and receive
 * `{ externalMessageId, response }`.
 */

function extractMessageId(response) {
  return response?.messages?.[0]?.id ?? null;
}

export async function sendText({ phoneNumberId, accessToken, to, text, previewUrl = false, ...options }) {
  const response = await metaClient.sendMessage(
    phoneNumberId,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: previewUrl, body: text },
    },
    { ...options, accessToken },
  );
  return { externalMessageId: extractMessageId(response), response };
}

export async function sendImage({ phoneNumberId, accessToken, to, link, id, caption, ...options }) {
  const image = id ? { id } : { link };
  if (caption) image.caption = caption;

  const response = await metaClient.sendMessage(
    phoneNumberId,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "image",
      image,
    },
    { ...options, accessToken },
  );
  return { externalMessageId: extractMessageId(response), response };
}

export async function sendDocument({ phoneNumberId, accessToken, to, link, id, filename, caption, ...options }) {
  const document = id ? { id } : { link };
  if (filename) document.filename = filename;
  if (caption) document.caption = caption;

  const response = await metaClient.sendMessage(
    phoneNumberId,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "document",
      document,
    },
    { ...options, accessToken },
  );
  return { externalMessageId: extractMessageId(response), response };
}

export async function sendInteractive({ phoneNumberId, accessToken, to, interactive, ...options }) {
  const response = await metaClient.sendMessage(
    phoneNumberId,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive,
    },
    { ...options, accessToken },
  );
  return { externalMessageId: extractMessageId(response), response };
}

export async function sendTemplate({
  phoneNumberId,
  accessToken,
  to,
  name,
  language,
  components,
  ...options
}) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name,
      language: { code: language },
      ...(components ? { components } : {}),
    },
  };

  const response = await metaClient.sendMessage(phoneNumberId, payload, {
    ...options,
    accessToken,
  });
  return { externalMessageId: extractMessageId(response), response };
}

export function getPhoneNumber(phoneNumberId, options = {}) {
  return metaClient.getPhoneNumber(phoneNumberId, options);
}

export function getTemplates(wabaId, options = {}) {
  return metaClient.getTemplates(wabaId, options);
}
