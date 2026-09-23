import test from "node:test";
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret, isEncrypted } from "../src/lib/crypto.js";

process.env.ENCRYPTION_KEY ??= "test-encryption-key";

test("encryptSecret produces ciphertext with the expected prefix", () => {
  const encrypted = encryptSecret("super-secret");
  assert.notEqual(encrypted, "super-secret");
  assert.equal(isEncrypted(encrypted), true);
  assert.match(encrypted, /^enc\.v1:/);
});

test("decryptSecret round-trips the plaintext", () => {
  const plaintext = "wamid.token.value:with:colons";
  assert.equal(decryptSecret(encryptSecret(plaintext)), plaintext);
});

test("encryption is non-deterministic", () => {
  assert.notEqual(encryptSecret("same"), encryptSecret("same"));
});

test("null and undefined pass through untouched", () => {
  assert.equal(encryptSecret(null), null);
  assert.equal(encryptSecret(undefined), undefined);
  assert.equal(decryptSecret("plain"), "plain");
});
