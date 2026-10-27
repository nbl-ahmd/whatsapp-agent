import { env } from "../../config/env.js";
import { ExternalServiceError } from "../../lib/errors.js";

/**
 * Low-level Meta Graph API client. This is the only place that knows about
 * Graph API URLs, versions and error envelopes. Everything above it speaks the
 * provider-neutral `service.js` interface.
 */

const DEFAULT_TIMEOUT_MS = 15000;

export function buildGraphUrl(path, baseUrl, version) {
  // Pagination links returned by Graph are absolute; use them unchanged.
  if (/^https?:\/\//i.test(path)) return path;

  const base = (baseUrl || env.meta.graphApiBaseUrl || "https://graph.facebook.com").replace(
    /\/$/,
    "",
  );
  const apiVersion = version || env.meta.graphApiVersion;
  return `${base}/${apiVersion}${path}`;
}

/**
 * @param {string} path e.g. `/123/messages` (absolute URLs are accepted too)
 * @param {object} [options]
 * @param {"GET"|"POST"|"PATCH"|"DELETE"} [options.method]
 * @param {object} [options.body] JSON body
 * @param {FormData} [options.formData] multipart body (Content-Type is set by fetch)
 * @param {string} [options.accessToken]
 * @param {string} [options.baseUrl]
 * @param {string} [options.version]
 * @param {typeof fetch} [options.fetchImpl]
 */
export async function callGraphApi(path, options = {}) {
  const {
    method = "GET",
    body,
    formData,
    baseUrl,
    version,
    fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const accessToken = options.accessToken ?? env.meta.accessToken;
  if (!accessToken) {
    throw new ExternalServiceError(
      "No WhatsApp access token available. Set WHATSAPP_ACCESS_TOKEN or store an account token.",
    );
  }

  const headers = { Authorization: `Bearer ${accessToken}` };
  let requestBody;
  if (formData !== undefined) {
    requestBody = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetchImpl(buildGraphUrl(path, baseUrl, version), {
      method,
      headers,
      body: requestBody,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new ExternalServiceError(`Graph API request failed: ${error.message}`, {
      path,
    });
  }

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const graphError = data?.error;
    throw new ExternalServiceError(
      graphError?.message || `Graph API request failed with status ${response.status}`,
      { status: response.status, path, error: graphError },
    );
  }

  return data;
}

function queryString(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export function sendMessage(phoneNumberId, payload, options = {}) {
  return callGraphApi(`/${phoneNumberId}/messages`, {
    ...options,
    method: "POST",
    body: payload,
  });
}

export function getPhoneNumber(phoneNumberId, options = {}) {
  const fields =
    options.fields ||
    "id,display_phone_number,verified_name,quality_rating,status,platform_type,code_verification_status";
  return callGraphApi(`/${phoneNumberId}?fields=${fields}`, options);
}

// ---------------------------------------------------------------------------
// WhatsApp Business Accounts
// ---------------------------------------------------------------------------

export function getWaba(wabaId, options = {}) {
  const fields =
    options.fields || "id,name,timezone_id,account_review_status,message_template_namespace";
  return callGraphApi(
    `/${encodeURIComponent(wabaId)}${queryString({ fields })}`,
    options,
  );
}

export function getWabaPhoneNumbers(wabaId, options = {}) {
  const fields =
    options.fields ||
    "id,display_phone_number,verified_name,quality_rating,status,platform_type,code_verification_status";
  return callGraphApi(
    `/${encodeURIComponent(wabaId)}/phone_numbers${queryString({
      fields,
      limit: options.limit,
      after: options.after,
      before: options.before,
    })}`,
    options,
  );
}

/** Apps currently subscribed to this WABA (i.e. whose webhooks receive events). */
export function getSubscribedApps(wabaId, options = {}) {
  return callGraphApi(`/${encodeURIComponent(wabaId)}/subscribed_apps`, options);
}

/** Subscribe this app to the WABA so Meta delivers its webhooks here. */
export function subscribeApp(wabaId, options = {}) {
  return callGraphApi(`/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    ...options,
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// Message templates
// ---------------------------------------------------------------------------

export function getTemplates(wabaId, options = {}) {
  const fields =
    options.fields ||
    "id,name,status,category,language,components,parameter_format,quality_score,rejected_reason,last_updated_time,previous_category,sub_category";
  return callGraphApi(
    `/${encodeURIComponent(wabaId)}/message_templates${queryString({
      fields,
      status: options.status,
      limit: options.limit,
      after: options.after,
      before: options.before,
    })}`,
    options,
  );
}

export function getTemplate(templateId, options = {}) {
  const fields =
    options.fields ||
    "id,name,status,category,language,components,parameter_format,quality_score,rejected_reason,last_updated_time,previous_category,sub_category";
  return callGraphApi(
    `/${encodeURIComponent(templateId)}${queryString({ fields })}`,
    options,
  );
}

export function createTemplate(wabaId, template, options = {}) {
  return callGraphApi(`/${encodeURIComponent(wabaId)}/message_templates`, {
    ...options,
    method: "POST",
    body: template,
  });
}

export function updateTemplate(templateId, updates, options = {}) {
  return callGraphApi(`/${encodeURIComponent(templateId)}`, {
    ...options,
    method: "POST",
    body: updates,
  });
}

export function deleteTemplate(wabaId, { hsmId, name, hsmIds } = {}, options = {}) {
  const params = {};
  if (Array.isArray(hsmIds) && hsmIds.length > 0) params.hsm_ids = JSON.stringify(hsmIds);
  if (hsmId) params.hsm_id = hsmId;
  if (name) params.name = name;
  return callGraphApi(
    `/${encodeURIComponent(wabaId)}/message_templates${queryString(params)}`,
    { ...options, method: "DELETE" },
  );
}

// ---------------------------------------------------------------------------
// WhatsApp Flows
// ---------------------------------------------------------------------------

const FLOW_FIELDS =
  "id,name,status,categories,validation_errors,json_version,data_api_version,endpoint_uri,preview,health_status";

export function getFlows(wabaId, options = {}) {
  return callGraphApi(
    `/${encodeURIComponent(wabaId)}/flows${queryString({
      fields: options.fields || FLOW_FIELDS,
      limit: options.limit,
      after: options.after,
      before: options.before,
    })}`,
    options,
  );
}

export function getFlow(flowId, options = {}) {
  return callGraphApi(
    `/${encodeURIComponent(flowId)}${queryString({
      fields: options.fields || FLOW_FIELDS,
    })}`,
    options,
  );
}

export function getFlowAssets(flowId, options = {}) {
  return callGraphApi(`/${encodeURIComponent(flowId)}/assets`, options);
}

/** Download a Flow asset (the Flows API returns a short-lived URL). */
export function getFlowAsset(url, options = {}) {
  return callGraphApi(url, options);
}

export function createFlow(wabaId, flow, options = {}) {
  return callGraphApi(`/${encodeURIComponent(wabaId)}/flows`, {
    ...options,
    method: "POST",
    body: flow,
  });
}

export function updateFlow(flowId, updates, options = {}) {
  return callGraphApi(`/${encodeURIComponent(flowId)}`, {
    ...options,
    method: "POST",
    body: updates,
  });
}

/**
 * Upload/update a Flow's JSON asset. The Flows API requires multipart/form-data;
 * the file must be named `flow.json`.
 */
export function uploadFlowAsset(flowId, flowJson, options = {}) {
  const text =
    typeof flowJson === "string" ? flowJson : JSON.stringify(flowJson ?? {});
  const formData = new FormData();
  formData.append("name", "flow.json");
  formData.append("asset_type", "FLOW_JSON");
  formData.append(
    "file",
    new Blob([text], { type: "application/json" }),
    "flow.json",
  );

  return callGraphApi(`/${encodeURIComponent(flowId)}/assets`, {
    ...options,
    method: "POST",
    formData,
  });
}

export function publishFlow(flowId, options = {}) {
  return callGraphApi(`/${encodeURIComponent(flowId)}/publish`, {
    ...options,
    method: "POST",
  });
}

export function deprecateFlow(flowId, options = {}) {
  return callGraphApi(`/${encodeURIComponent(flowId)}/deprecate`, {
    ...options,
    method: "POST",
  });
}

export function deleteFlow(flowId, options = {}) {
  return callGraphApi(`/${encodeURIComponent(flowId)}`, {
    ...options,
    method: "DELETE",
  });
}

/**
 * Media metadata (including a short-lived download URL). Cloud API media ids
 * expire, so callers must handle a 404 here.
 */
export function getMedia(mediaId, options = {}) {
  const query = options.phoneNumberId
    ? `?phone_number_id=${encodeURIComponent(options.phoneNumberId)}`
    : "";
  return callGraphApi(`/${encodeURIComponent(mediaId)}${query}`, options);
}
