/**
 * Session storage for the browser.
 *
 * The API token is held in one place so the API client, the auth context and
 * the login screen never read storage directly. The token is the only tenant
 * identity the frontend carries; organization ids are never sent, because the
 * backend derives them from the token.
 */

const SESSION_KEY = "wa.session";

let memory = null;
const listeners = new Set();

function notify() {
  for (const listener of listeners) listener(memory);
}

/** @param {(session: object|null) => void} listener */
export function subscribeSession(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readSession() {
  if (typeof window === "undefined") return null;
  if (memory) return memory;

  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    memory = raw ? JSON.parse(raw) : null;
  } catch {
    memory = null;
  }

  return memory;
}

export function writeSession(session) {
  memory = session;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      /* storage unavailable: the in-memory copy still works for this tab */
    }
  }
  notify();
}

export function clearSession() {
  memory = null;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }
  notify();
}

export function getToken() {
  return readSession()?.token || null;
}
