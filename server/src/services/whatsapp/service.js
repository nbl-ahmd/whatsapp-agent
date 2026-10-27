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

/**
 * Interactive Flow message (user-initiated / inside the customer service
 * window). Test numbers cannot use this outside a session, so business-
 * initiated Flows should be sent as a template with a FLOW button instead.
 */
export async function sendFlow({
  phoneNumberId,
  accessToken,
  to,
  flowId,
  flowName,
  flowCta = "Open",
  flowToken = "unused",
  flowAction = "navigate",
  flowActionPayload,
  mode = "published",
  header,
  body,
  footer,
  ...options
}) {
  const parameters = {
    flow_message_version: "3",
    flow_cta: flowCta,
    flow_token: flowToken,
    mode,
    ...(flowId ? { flow_id: flowId } : {}),
    ...(flowName ? { flow_name: flowName } : {}),
    ...(flowAction ? { flow_action: flowAction } : {}),
    ...(flowActionPayload ? { flow_action_payload: flowActionPayload } : {}),
  };

  const interactive = {
    type: "flow",
    ...(header ? { header } : {}),
    ...(body ? { body } : {}),
    ...(footer ? { footer } : {}),
    action: { name: "flow", parameters },
  };

  return sendInteractive({
    phoneNumberId,
    accessToken,
    to,
    interactive,
    ...options,
  });
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

export function getWaba(wabaId, options = {}) {
  return metaClient.getWaba(wabaId, options);
}

export function getWabaPhoneNumbers(wabaId, options = {}) {
  return metaClient.getWabaPhoneNumbers(wabaId, options);
}

export function getSubscribedApps(wabaId, options = {}) {
  return metaClient.getSubscribedApps(wabaId, options);
}

export function subscribeApp(wabaId, options = {}) {
  return metaClient.subscribeApp(wabaId, options);
}

export function getTemplates(wabaId, options = {}) {
  return metaClient.getTemplates(wabaId, options);
}

export function getTemplate(templateId, options = {}) {
  return metaClient.getTemplate(templateId, options);
}

export function createTemplate(wabaId, template, options = {}) {
  return metaClient.createTemplate(wabaId, template, options);
}

export function updateTemplate(templateId, updates, options = {}) {
  return metaClient.updateTemplate(templateId, updates, options);
}

export function deleteTemplate(wabaId, selector, options = {}) {
  return metaClient.deleteTemplate(wabaId, selector, options);
}

export function getFlows(wabaId, options = {}) {
  return metaClient.getFlows(wabaId, options);
}

export function getFlow(flowId, options = {}) {
  return metaClient.getFlow(flowId, options);
}

export function getFlowAssets(flowId, options = {}) {
  return metaClient.getFlowAssets(flowId, options);
}

export function getFlowAsset(url, options = {}) {
  return metaClient.getFlowAsset(url, options);
}

export function createFlow(wabaId, flow, options = {}) {
  return metaClient.createFlow(wabaId, flow, options);
}

export function updateFlow(flowId, updates, options = {}) {
  return metaClient.updateFlow(flowId, updates, options);
}

export function uploadFlowAsset(flowId, flowJson, options = {}) {
  return metaClient.uploadFlowAsset(flowId, flowJson, options);
}

export function publishFlow(flowId, options = {}) {
  return metaClient.publishFlow(flowId, options);
}

export function deprecateFlow(flowId, options = {}) {
  return metaClient.deprecateFlow(flowId, options);
}

export function deleteFlow(flowId, options = {}) {
  return metaClient.deleteFlow(flowId, options);
}
