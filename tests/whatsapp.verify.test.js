import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyChallenge, verifySignature } from "../server/src/services/webhooks/verify.js";

function sign(body, secret) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

test("verifySignature accepts a valid signature", () => {
  const body = '{"object":"whatsapp_business_account"}';
  assert.equal(verifySignature(body, sign(body, "app-secret"), "app-secret"), true);
});

test("verifySignature rejects tampered bodies and wrong secrets", () => {
  const body = "{}";
  const signature = sign(body, "app-secret");
  assert.equal(verifySignature(`${body} `, signature, "app-secret"), false);
  assert.equal(verifySignature(body, signature, "other-secret"), false);
  assert.equal(verifySignature(body, undefined, "app-secret"), false);
  assert.equal(verifySignature(body, "sha1=abc", "app-secret"), false);
  assert.equal(verifySignature(body, signature, ""), false);
});

test("verifyChallenge accepts the correct token", () => {
  const result = verifyChallenge({
    mode: "subscribe",
    token: "verify-me",
    challenge: "12345",
    expectedToken: "verify-me",
  });
  assert.deepEqual(result, { ok: true, challenge: "12345" });
});

test("verifyChallenge rejects wrong token, mode or missing config", () => {
  assert.equal(
    verifyChallenge({
      mode: "subscribe",
      token: "wrong",
      challenge: "1",
      expectedToken: "verify-me",
    }).ok,
    false,
  );
  assert.equal(
    verifyChallenge({
      mode: "unsubscribe",
      token: "verify-me",
      challenge: "1",
      expectedToken: "verify-me",
    }).ok,
    false,
  );
  assert.equal(
    verifyChallenge({ mode: "subscribe", token: "verify-me", challenge: "1" }).ok,
    false,
  );
});
