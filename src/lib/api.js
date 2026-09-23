/**
 * Centralized frontend API client.
 *
 * All backend calls go through this module using NEXT_PUBLIC_API_URL, so the
 * backend URL is never hardcoded across components.
 */

export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
).replace(/\/+$/, "");

export function apiUrl(path = "") {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${suffix}`;
}

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * @param {string} path e.g. "/api/conversations"
 * @param {{ method?: string, body?: unknown, headers?: Record<string,string> }} [options]
 */
export async function apiFetch(path, { method = "GET", body, headers, ...rest } = {}) {
  const response = await fetch(apiUrl(path), {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...rest,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new ApiError(data?.error?.message || `Request failed (${response.status})`, {
      status: response.status,
      code: data?.error?.code,
      details: data?.error?.details,
    });
  }

  return data;
}
