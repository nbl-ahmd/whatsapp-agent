import test, { after } from "node:test";
import assert from "node:assert/strict";
import { encryptSecret } from "../server/src/lib/crypto.js";
import { prisma } from "../server/src/db/prisma.js";
import { sendTextMessage } from "../server/src/services/messages/outbound.js";
import { handleWhatsAppWebhook } from "../server/src/services/webhooks/process.js";

process.env.ENCRYPTION_KEY ??= "test-encryption-key";

const suffix = Math.random().toString(36).slice(2, 8);
const phoneNumberId = `test-pn-${suffix}`;
const outboundWamid = `wamid.out.${suffix}`;

after(async () => {
  await prisma.$disconnect();
});

async function setupTenant() {
  const organization = await prisma.organization.create({
    data: { name: "WhatsApp Test Org", slug: `wa-test-${suffix}` },
  });
  const account = await prisma.whatsAppAccount.create({
    data: {
      organizationId: organization.id,
      name: "Test Account",
      wabaId: `WABA_TEST_${suffix}`,
      accessToken: encryptSecret("test-access-token"),
      status: "ACTIVE",
    },
  });
  const phoneNumber = await prisma.whatsAppPhoneNumber.create({
    data: {
      organizationId: organization.id,
      whatsappAccountId: account.id,
      phoneNumberId,
      displayPhoneNumber: "+15550009999",
      status: "CONNECTED",
    },
  });
  return { organization, account, phoneNumber };
}

async function cleanup(organizationId) {
  await prisma.webhookEvent.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });
}

function inboundPayload(waId, wamid, text) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: `WABA_TEST_${suffix}`,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "+15550009999", phone_number_id: phoneNumberId },
              contacts: [{ profile: { name: "Test Sender" }, wa_id: waId }],
              messages: [
                { from: waId, id: wamid, timestamp: "1700000000", type: "text", text: { body: text } },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function sendStatusWebhook(wamid, status) {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: `WABA_TEST_${suffix}`,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "+15550009999", phone_number_id: phoneNumberId },
              statuses: [
                {
                  id: wamid,
                  status,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  recipient_id: "15550002222",
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const rawBody = JSON.stringify(payload);
  return handleWhatsAppWebhook({ rawBody, payload, headers: {} });
}

test("inbound webhook is idempotent and creates contact, conversation and message", async (t) => {
  const { organization } = await setupTenant();
  t.after(() => cleanup(organization.id));

  const payload = inboundPayload("15550001111", `wamid.in.${suffix}`, "Hello there");
  const rawBody = JSON.stringify(payload);

  const first = await handleWhatsAppWebhook({ rawBody, payload, headers: {} });
  assert.equal(first.duplicate, false);
  assert.equal(first.processed, 1);

  const second = await handleWhatsAppWebhook({ rawBody, payload, headers: {} });
  assert.equal(second.duplicate, true);

  const contacts = await prisma.contact.findMany({ where: { organizationId: organization.id } });
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].waId, "15550001111");
  assert.equal(contacts[0].profileName, "Test Sender");

  const conversations = await prisma.conversation.findMany({
    where: { organizationId: organization.id },
  });
  assert.equal(conversations.length, 1);
  assert.equal(conversations[0].unreadCount, 1);

  const messages = await prisma.message.findMany({ where: { organizationId: organization.id } });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].direction, "inbound");
  assert.equal(messages[0].status, "received");
  assert.equal(messages[0].text, "Hello there");

  const events = await prisma.webhookEvent.findMany({ where: { organizationId: organization.id } });
  assert.equal(events.length, 1);
  assert.equal(events[0].status, "processed");
});

test("unknown phone number is ignored without failing", async (t) => {
  const { organization } = await setupTenant();
  t.after(async () => {
    // Unknown numbers cannot resolve a tenant, so these events have no org.
    await prisma.webhookEvent.deleteMany({ where: { organizationId: null } });
    await cleanup(organization.id);
  });

  const payload = inboundPayload("15550003333", `wamid.unknown.${suffix}`, "hi");
  payload.entry[0].changes[0].value.metadata.phone_number_id = "unknown-phone-number";
  const rawBody = JSON.stringify(payload);

  const result = await handleWhatsAppWebhook({ rawBody, payload, headers: {} });
  assert.equal(result.processed, 0);

  const messages = await prisma.message.findMany({ where: { organizationId: organization.id } });
  assert.equal(messages.length, 0);
});

test("outbound send persists the message and status webhooks advance its state", async (t) => {
  const { organization, phoneNumber } = await setupTenant();
  t.after(() => cleanup(organization.id));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        messaging_product: "whatsapp",
        contacts: [{ wa_id: "15550002222" }],
        messages: [{ id: outboundWamid }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  try {
    const result = await sendTextMessage({
      organizationId: organization.id,
      phoneNumberId: phoneNumber.phoneNumberId,
      to: "15550002222",
      text: "Hi from the test endpoint",
    });
    assert.equal(result.message.direction, "outbound");
    assert.equal(result.message.status, "sent");
    assert.equal(result.message.externalMessageId, outboundWamid);
  } finally {
    globalThis.fetch = originalFetch;
  }

  await sendStatusWebhook(outboundWamid, "delivered");
  let message = await prisma.message.findUnique({ where: { externalMessageId: outboundWamid } });
  assert.equal(message.status, "delivered");

  await sendStatusWebhook(outboundWamid, "read");
  message = await prisma.message.findUnique({ where: { externalMessageId: outboundWamid } });
  assert.equal(message.status, "read");

  await sendStatusWebhook(outboundWamid, "delivered");
  message = await prisma.message.findUnique({ where: { externalMessageId: outboundWamid } });
  assert.equal(message.status, "read", "out-of-order status must not downgrade read");

  await sendStatusWebhook(outboundWamid, "failed");
  message = await prisma.message.findUnique({ where: { externalMessageId: outboundWamid } });
  assert.equal(message.status, "failed");
});
