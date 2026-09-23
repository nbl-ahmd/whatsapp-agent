import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createApp } from "../server/src/app.js";
import { env } from "../server/src/config/env.js";
import { prisma } from "../server/src/db/prisma.js";

const VERIFY_TOKEN = "server-http-verify-token";
const APP_SECRET = "server-http-app-secret";
const MARKER = "server-http-test";

after(async () => {
  await prisma.webhookEvent
    .deleteMany({ where: { payload: { path: ["test"], equals: MARKER } } })
    .catch(() => {});
  await prisma.$disconnect();
});

async function withServer(run) {
  const app = createApp();
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function sign(body) {
  return `sha256=${createHmac("sha256", APP_SECRET).update(body).digest("hex")}`;
}

test("GET /health returns ok without exposing internals", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });
  });
});

test("GET /api/webhooks/whatsapp verifies the challenge", async () => {
  env.meta.verifyToken = VERIFY_TOKEN;
  await withServer(async (base) => {
    const ok = await fetch(
      `${base}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=challenge-123`,
    );
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), "challenge-123");

    const bad = await fetch(
      `${base}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-123`,
    );
    assert.equal(bad.status, 403);
  });
});

test("POST /api/webhooks/whatsapp enforces the HMAC signature", async () => {
  env.meta.appSecret = APP_SECRET;
  await withServer(async (base) => {
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [], test: MARKER });

    const invalid = await fetch(`${base}/api/webhooks/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=deadbeef" },
      body,
    });
    assert.equal(invalid.status, 401);

    const valid = await fetch(`${base}/api/webhooks/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(body) },
      body,
    });
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).received, true);
  });
});

test("POST /api/webhooks/whatsapp rejects invalid JSON", async () => {
  env.meta.appSecret = "";
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/webhooks/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });
    assert.equal(res.status, 400);
  });
});
