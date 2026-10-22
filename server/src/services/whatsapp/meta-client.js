import { env } from "../../config/env.js";
import { ExternalServiceError } from "../../lib/errors.js";

/**
 * Low-level Meta Graph API client. This is the only place that knows about
 * Graph API URLs, versions and error envelopes. Everything above it speaks the
 * provider-neutral `service.js` interface.
 */

const DEFAULT_TIMEOUT_MS = 15000;

export function buildGraphUrl(path, baseUrl, version) {
  const base = (baseUrl || env.meta.graphApiBaseUrl || "https://graph.facebook.com").replace(
    /\/$/,
    "",
  );
  const apiVersion = version || env.meta.graphApiVersion;
  return `${base}/${apiVersion}${path}`;
}

/**
 * @param {string} path e.g. `/123/messages`
 * @param {object} [options]
 * @param {"GET"|"POST"} [options.method]
 * @param {object} [options.body]
 * @param {string} [options.accessToken]
 * @param {string} [options.baseUrl]
 * @param {string} [options.version]
 * @param {typeof fetch} [options.fetchImpl]
 */
export async function callGraphApi(path, options = {}) {
  const {
    method = "GET",
    body,
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

  let response;
  try {
    response = await fetchImpl(buildGraphUrl(path, baseUrl, version), {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
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

export function sendMessage(phoneNumberId, payload, options = {}) {
  return callGraphApi(`/${phoneNumberId}/messages`, {
    ...options,
    method: "POST",
    body: payload,
  });
}

export function getPhoneNumber(phoneNumberId, options = {}) {
  const fields = options.fields || "id,display_phone_number,verified_name,quality_rating";
  return callGraphApi(`/${phoneNumberId}?fields=${fields}`, options);
}

export function getTemplates(wabaId, options = {}) {
  const fields = options.fields || "id,name,status,category,language,components";
  return callGraphApi(`/${wabaId}/message_templates?fields=${fields}`, options);
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
