import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { UnauthorizedError } from "./errors.js";

/**
 * Minimal HS256 session token ("JWT-shaped", implemented with node:crypto so no
 * dependency is needed). The token is the authenticated context for the API:
 * organization id is derived from it and never from client input.
 */

const HEADER = { alg: "HS256", typ: "JWT" };

function secret() {
  if (!env.authSecret) {
    throw new Error(
      "AUTH_SECRET (or ENCRYPTION_KEY) is not set. Generate one with `openssl rand -hex 32`.",
    );
  }
  return env.authSecret;
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(data) {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function createToken({ userId, organizationId, role }, { ttlHours = env.authTokenTtlHours } = {}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    org: organizationId,
    role,
    iat: issuedAt,
    exp: issuedAt + Math.round(ttlHours * 3600),
  };

  const body = `${base64url(JSON.stringify(HEADER))}.${base64url(JSON.stringify(payload))}`;
  return `${body}.${sign(body)}`;
}

export function verifyToken(token) {
  if (typeof token !== "string") throw new UnauthorizedError("Missing session token");

  const parts = token.split(".");
  if (parts.length !== 3) throw new UnauthorizedError("Malformed session token");

  const [header, payload, signature] = parts;
  const expected = sign(`${header}.${payload}`);
  const provided = Buffer.from(signature);
  const wanted = Buffer.from(expected);

  if (provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) {
    throw new UnauthorizedError("Invalid session token");
  }

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new UnauthorizedError("Malformed session token");
  }

  if (!claims?.sub || !claims?.org) throw new UnauthorizedError("Incomplete session token");
  if (typeof claims.exp === "number" && claims.exp * 1000 <= Date.now()) {
    throw new UnauthorizedError("Session expired");
  }

  return {
    userId: claims.sub,
    organizationId: claims.org,
    role: claims.role ?? "AGENT",
    expiresAt: claims.exp ? new Date(claims.exp * 1000) : null,
  };
}

/** Read a bearer token from an Authorization header. */
export function bearerToken(headerValue) {
  if (typeof headerValue !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match ? match[1] : null;
}
