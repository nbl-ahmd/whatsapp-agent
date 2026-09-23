import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveEventType,
  extractMessageChanges,
  mapMessageType,
  mapStatus,
  normalizeInboundMessage,
  normalizeMessageStatus,
} from "../server/src/services/webhooks/normalize.js";

const message = {
  from: "15550001111",
  id: "wamid.inbound.1",
  timestamp: "1700000000",
  type: "text",
  text: { body: "Hello" },
};

const payload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_1",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "+15550000001", phone_number_id: "PN_1" },
            contacts: [{ profile: { name: "Jane" }, wa_id: "15550001111" }],
            messages: [message],
          },
        },
      ],
    },
  ],
};

test("extractMessageChanges flattens the payload with phone number id", () => {
  const changes = extractMessageChanges(payload);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].phoneNumberId, "PN_1");
  assert.equal(changes[0].wabaId, "WABA_1");
});

test("deriveEventType detects message vs status payloads", () => {
  assert.equal(deriveEventType(payload), "MESSAGE_RECEIVED");
  assert.equal(
    deriveEventType({
      entry: [{ changes: [{ field: "messages", value: { statuses: [{ id: "x" }] } }] }],
    }),
    "MESSAGE_STATUS",
  );
  assert.equal(deriveEventType({ entry: [] }), null);
});

test("normalizeInboundMessage produces the internal event shape", () => {
  const normalized = normalizeInboundMessage({
    organizationId: "org_1",
    phoneNumberId: "PN_1",
    message,
    contacts: payload.entry[0].changes[0].value.contacts,
  });

  assert.equal(normalized.kind, "message");
  assert.equal(normalized.organizationId, "org_1");
  assert.equal(normalized.channel, "whatsapp");
  assert.equal(normalized.phoneNumberId, "PN_1");
  assert.equal(normalized.externalMessageId, "wamid.inbound.1");
  assert.equal(normalized.waId, "15550001111");
  assert.equal(normalized.profileName, "Jane");
  assert.equal(normalized.type, "text");
  assert.equal(normalized.text, "Hello");
  assert.equal(normalized.timestamp.toISOString(), "2023-11-14T22:13:20.000Z");
});

test("normalizeInboundMessage extracts media and maps types", () => {
  const imageMessage = {
    from: "15550001111",
    id: "wamid.inbound.2",
    timestamp: "1700000000",
    type: "image",
    image: { id: "media_1", mime_type: "image/png", caption: "hi" },
  };
  const normalized = normalizeInboundMessage({
    organizationId: "org_1",
    phoneNumberId: "PN_1",
    message: imageMessage,
    contacts: [],
  });

  assert.equal(normalized.type, "image");
  assert.deepEqual(normalized.media, { type: "image", id: "media_1", mime_type: "image/png", caption: "hi" });
  assert.equal(normalized.text, null);
});

test("mapMessageType falls back to unknown", () => {
  assert.equal(mapMessageType("text"), "text");
  assert.equal(mapMessageType("button"), "interactive");
  assert.equal(mapMessageType("something-new"), "unknown");
});

test("normalizeMessageStatus maps supported statuses", () => {
  const normalized = normalizeMessageStatus({
    organizationId: "org_1",
    phoneNumberId: "PN_1",
    status: {
      id: "wamid.out.1",
      status: "delivered",
      timestamp: "1700000000",
      recipient_id: "15550002222",
    },
  });

  assert.equal(normalized.kind, "status");
  assert.equal(normalized.status, "delivered");
  assert.equal(normalized.externalMessageId, "wamid.out.1");
  assert.equal(normalized.recipientId, "15550002222");
});

test("mapStatus ignores unsupported statuses", () => {
  assert.equal(mapStatus("delivered"), "delivered");
  assert.equal(mapStatus("read"), "read");
  assert.equal(mapStatus("failed"), "failed");
  assert.equal(mapStatus("deleted"), null);
});
