import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Symmetric encryption for credentials at rest (Meta access tokens, app
 * secrets, integration credentials). Never store these values in plaintext.
 *
 * Format: enc.v1:<iv b64>:<auth tag b64>:<ciphertext b64>
 */

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc.v1";
const IV_LENGTH = 12;

function getKey() {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate one with `openssl rand -hex 32`.",
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

export function encryptSecret(plaintext) {
  if (plaintext === null || plaintext === undefined) return plaintext;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [PREFIX, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(
    ":",
  );
}

export function decryptSecret(payload) {
  if (!isEncrypted(payload)) return payload;

  const [, ivB64, tagB64, dataB64] = payload.split(":");
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
