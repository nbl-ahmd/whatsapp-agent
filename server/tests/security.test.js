import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { createRateLimiter } from "../src/lib/rateLimit.js";

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

test("security headers and a request id are set on every response", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/health`);

    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.equal(res.headers.get("referrer-policy"), "no-referrer");
    assert.match(res.headers.get("permissions-policy"), /camera=\(\)/);
    assert.match(res.headers.get("content-security-policy"), /default-src 'none'/);
    assert.match(res.headers.get("x-request-id"), /^[a-f0-9-]{36}$/);
    assert.equal(res.headers.get("x-powered-by"), null);
  });
});

test("a safe caller request id is preserved, an unsafe one is replaced", async () => {
  await withServer(async (base) => {
    const supplied = "client-request-12345";
    const kept = await fetch(`${base}/health`, {
      headers: { "x-request-id": supplied },
    });
    assert.equal(kept.headers.get("x-request-id"), supplied);

    const unsafe = await fetch(`${base}/health`, {
      headers: { "x-request-id": "<script>" },
    });
    assert.notEqual(unsafe.headers.get("x-request-id"), "<script>");
    assert.match(unsafe.headers.get("x-request-id"), /^[a-f0-9-]{36}$/);
  });
});

test("error responses include the request id for support", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/does-not-exist`, {
      headers: { "x-request-id": "support-ticket-1" },
    });
    assert.equal(res.status, 404);

    const body = await res.json();
    assert.equal(body.error.code, "NOT_FOUND");
    assert.equal(body.error.requestId, "support-ticket-1");
    assert.equal(res.headers.get("x-request-id"), "support-ticket-1");
  });
});

test("rate limiter allows the quota, then returns a 429-style error with Retry-After", () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, name: "test" });
  const headers = new Map();
  const res = { setHeader: (name, value) => headers.set(name, value) };
  const req = { ip: "203.0.113.10" };

  const errors = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    limiter(req, res, (error) => errors.push(error));
  }

  assert.equal(errors.length, 3);
  assert.equal(errors[0], undefined);
  assert.equal(errors[1], undefined);
  assert.equal(errors[2]?.code, "RATE_LIMITED");
  assert.equal(errors[2]?.statusCode, 429);
  assert.equal(headers.get("RateLimit-Limit"), "2");
  assert.equal(headers.get("RateLimit-Remaining"), "0");
  assert.ok(Number(headers.get("Retry-After")) >= 1);
});

test("rate limiter keeps separate buckets per key", () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1, name: "test-keys" });
  const res = { setHeader: () => {} };

  const first = [];
  limiter({ ip: "198.51.100.1" }, res, (error) => first.push(error));
  limiter({ ip: "198.51.100.2" }, res, (error) => first.push(error));
  assert.deepEqual(first, [undefined, undefined]);

  const second = [];
  limiter({ ip: "198.51.100.1" }, res, (error) => second.push(error));
  assert.equal(second[0]?.code, "RATE_LIMITED");
});
