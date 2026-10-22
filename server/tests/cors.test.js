import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";

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

test("CORS reflects configured origins, normalizes slashes and supports preview wildcards", async () => {
  env.frontendUrl = "https://app.example.com/, https://*.vercel.app, *";

  await withServer(async (base) => {
    const exact = await fetch(`${base}/health`, {
      headers: { origin: "https://app.example.com" },
    });
    assert.equal(exact.headers.get("access-control-allow-origin"), "https://app.example.com");
    assert.match(exact.headers.get("access-control-expose-headers"), /x-request-id/);

    const preview = await fetch(`${base}/health`, {
      headers: { origin: "https://whatsapp-agent-git-main-team.vercel.app" },
    });
    assert.equal(
      preview.headers.get("access-control-allow-origin"),
      "https://whatsapp-agent-git-main-team.vercel.app",
    );

    const disallowed = await fetch(`${base}/health`, {
      headers: { origin: "https://evil.example.net" },
    });
    assert.equal(disallowed.headers.get("access-control-allow-origin"), null);
  });
});

test("CORS preflight succeeds for allowed origins and rejects others", async () => {
  env.frontendUrl = "https://app.example.com";

  await withServer(async (base) => {
    const allowed = await fetch(`${base}/api/auth/register`, {
      method: "OPTIONS",
      headers: {
        origin: "https://app.example.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://app.example.com");
    assert.match(allowed.headers.get("access-control-allow-methods"), /POST/);
    assert.match(allowed.headers.get("access-control-allow-headers"), /Authorization/);

    const blocked = await fetch(`${base}/api/auth/register`, {
      method: "OPTIONS",
      headers: {
        origin: "https://evil.example.net",
        "access-control-request-method": "POST",
      },
    });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.headers.get("access-control-allow-origin"), null);
  });
});
