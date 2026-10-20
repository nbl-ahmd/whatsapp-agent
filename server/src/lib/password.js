import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing with scrypt (built into Node, so no dependency is added).
 *
 * Format: scrypt.v1:<N>:<r>:<p>:<salt b64>:<hash b64>
 */

const scrypt = promisify(scryptCallback);

const PREFIX = "scrypt.v1";
const PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, PARAMS.keylen, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
  });

  return [
    PREFIX,
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join(":");
}

export async function verifyPassword(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const [prefix, n, r, p, saltB64, hashB64] = stored.split(":");
  if (prefix !== PREFIX || !saltB64 || !hashB64) return false;

  const derived = await scrypt(password, Buffer.from(saltB64, "base64"), Buffer.from(hashB64, "base64").length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });

  const expected = Buffer.from(hashB64, "base64");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
