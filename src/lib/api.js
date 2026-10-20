/**
 * Centralized frontend API client.
 *
 * All backend calls go through this module using NEXT_PUBLIC_API_URL, so the
 * backend URL is never hardcoded across components. Successful responses are
 * unwrapped from the `{ data }` envelope; errors become ApiError.
 *
 * The bearer token comes from the session store. Nothing here ever sends an
 * organization id: the backend takes tenant identity from the token.
 */

import { clearSession, getToken } from "./session";

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
 * @param {{ method?: string, body?: unknown, headers?: Record<string,string>, auth?: boolean }} [options]
 */
export async function apiFetch(path, { method = "GET", body, headers, auth = true, ...rest } = {}) {
  const token = auth ? getToken() : null;

  const response = await fetch(apiUrl(path), {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
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
    // An expired or revoked token must not leave a signed-in-looking shell behind.
    if (response.status === 401) clearSession();

    throw new ApiError(data?.error?.message || `Request failed (${response.status})`, {
      status: response.status,
      code: data?.error?.code,
      details: data?.error?.details,
    });
  }

  return data && typeof data === "object" && "data" in data ? data.data : data;
}

export const api = {
  get: (path, options) => apiFetch(path, { ...options, method: "GET" }),
  post: (path, body, options) => apiFetch(path, { ...options, method: "POST", body }),
  patch: (path, body, options) => apiFetch(path, { ...options, method: "PATCH", body }),
  del: (path, options) => apiFetch(path, { ...options, method: "DELETE" }),
};
