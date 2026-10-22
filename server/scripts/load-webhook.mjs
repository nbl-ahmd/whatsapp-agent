#!/usr/bin/env node
/**
 * Webhook load test.
 *
 * Sends signed, unique inbound text messages to a running API and reports
 * latency plus status counts. Point it at staging, never production customer
 * traffic, and use a dedicated test phone number.
 *
 * Required env:
 *   WEBHOOK_URL                 e.g. http://localhost:4000/api/webhooks/whatsapp
 *   WHATSAPP_APP_SECRET         same secret the API uses for HMAC verification
 *   WHATSAPP_PHONE_NUMBER_ID    a number that exists in the target database
 *
 * Optional:
 *   LOAD_MESSAGES=100           total deliveries (default 100)
 *   LOAD_CONCURRENCY=10         parallel requests (default 10)
 *   LOAD_FROM=15550100          sender wa_id (default 15550100)
 *
 * Usage:
 *   node scripts/load-webhook.mjs
 */

import { createHmac, randomUUID } from "node:crypto";

const url = process.env.WEBHOOK_URL;
const appSecret = process.env.WHATSAPP_APP_SECRET;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const total = Math.min(Math.max(Number(process.env.LOAD_MESSAGES) || 100, 1), 5000);
const concurrency = Math.min(Math.max(Number(process.env.LOAD_CONCURRENCY) || 10, 1), 100);
const from = process.env.LOAD_FROM || "15550100";

if (!url || !appSecret || !phoneNumberId) {
  console.error("WEBHOOK_URL, WHATSAPP_APP_SECRET and WHATSAPP_PHONE_NUMBER_ID are required.");
  process.exit(1);
}

function payload(index) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: `WABA_LOAD_${process.env.LOAD_WABA_ID || "test"}`,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "+15550000000", phone_number_id: phoneNumberId },
              messages: [
                {
                  from,
                  id: `wamid.load.${Date.now()}.${index}.${randomUUID().slice(0, 8)}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: `load test ${index}` },
                },
              ],
            },
          },
        ],
      },
    ],
  });
}

function sign(body) {
  return `sha256=${createHmac("sha256", appSecret).update(body).digest("hex")}`;
}

const latencies = [];
const statuses = new Map();

async function send(index) {
  const body = payload(index);
  const startedAt = process.hrtime.bigint();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(body) },
      body,
    });
    await response.text();
    statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
  } catch (error) {
    statuses.set("network-error", (statuses.get("network-error") ?? 0) + 1);
    console.error(`request ${index} failed: ${error.message}`);
  } finally {
    latencies.push(Number(process.hrtime.bigint() - startedAt) / 1e6);
  }
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

const startedAt = Date.now();
let next = 0;

async function worker() {
  while (next < total) {
    const index = next;
    next += 1;
    await send(index);
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));

const elapsed = (Date.now() - startedAt) / 1000;
const sorted = latencies.sort((left, right) => left - right);

console.log(
  JSON.stringify(
    {
      url,
      messages: total,
      concurrency,
      durationSeconds: Number(elapsed.toFixed(2)),
      throughputPerSecond: Number((total / elapsed).toFixed(1)),
      latencyMs: {
        min: Number(sorted[0]?.toFixed(1) ?? 0),
        p50: Number(percentile(sorted, 0.5).toFixed(1)),
        p95: Number(percentile(sorted, 0.95).toFixed(1)),
        max: Number(sorted.at(-1)?.toFixed(1) ?? 0),
      },
      statuses: Object.fromEntries(statuses),
    },
    null,
    2,
  ),
);

if ([...statuses.keys()].some((status) => status !== 200)) process.exitCode = 1;
