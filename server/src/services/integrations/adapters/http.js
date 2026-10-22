import { ExternalServiceError, ValidationError } from "../../../lib/errors.js";

/**
 * Minimal JSON HTTP client for provider adapters.
 *
 * Provider error bodies can contain useful messages, but they must never be
 * logged with credentials. The returned error carries a truncated message and
 * the upstream status only.
 */
export async function requestJson(
  url,
  { method = "GET", headers = {}, body, timeoutMs = 10_000 } = {},
) {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new ExternalServiceError("Integration request could not be completed", {
      cause: error?.name === "TimeoutError" ? "timeout" : "network error",
    });
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = new ExternalServiceError(`Provider returned ${response.status}`, {
      status: response.status,
      message: typeof payload?.message === "string" ? payload.message.slice(0, 200) : null,
    });
    error.upstreamStatus = response.status;
    throw error;
  }

  return payload;
}

export function isNotFound(error) {
  return error?.upstreamStatus === 404;
}

export function requireString(value, name, { max = 200 } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${name} is required`);
  }
  return value.trim().slice(0, max);
}
