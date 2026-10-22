import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { env } from "../src/config/env.js";
import { reportError } from "../src/lib/errorReporter.js";

test("error reporter is inert without a webhook URL", async () => {
  env.errorWebhookUrl = "";
  assert.equal(await reportError({ error: new Error("ignored") }), false);
});

test("error reporter posts a bounded, secret-free payload", async () => {
  let received = null;
  const server = createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      received = { headers: req.headers, body: JSON.parse(body) };
      res.writeHead(204).end();
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  env.errorWebhookUrl = `http://127.0.0.1:${port}/errors`;

  try {
    const error = new Error("database exploded");
    error.stack = "Error: database exploded\n    at handler (app.js:1:1)";
    assert.equal(
      await reportError({
        error,
        requestId: "req-12345678",
        method: "POST",
        path: "/api/contacts",
        organizationId: "org_test",
      }),
      true,
    );

    assert.equal(received.headers["content-type"], "application/json");
    assert.equal(received.body.source, "whatsapp-agent");
    assert.equal(received.body.requestId, "req-12345678");
    assert.equal(received.body.method, "POST");
    assert.equal(received.body.path, "/api/contacts");
    assert.equal(received.body.organizationId, "org_test");
    assert.equal(received.body.error.name, "Error");
    assert.equal(received.body.error.message, "database exploded");
    assert.match(received.body.error.stack, /handler/);
    assert.equal(received.body.headers, undefined);
    assert.equal(received.body.body, undefined);

    // Storm protection: a second failure inside the window is dropped.
    assert.equal(await reportError({ error: new Error("again") }), false);
  } finally {
    env.errorWebhookUrl = "";
    await new Promise((resolve) => server.close(resolve));
  }
});
