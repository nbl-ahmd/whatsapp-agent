import test, { after } from "node:test";
import assert from "node:assert/strict";
import { encryptSecret } from "../src/lib/crypto.js";
import { prisma } from "../src/db/prisma.js";
import { activeProvider } from "../src/services/ai/index.js";
import { bootstrapOrganizationDefaults } from "../src/services/organizations/service.js";
import { runAgentForConversation } from "../src/services/ai/agent.js";
import { processInboundEvent } from "../src/services/workers/index.js";
import { handleWhatsAppWebhook } from "../src/services/webhooks/process.js";

process.env.ENCRYPTION_KEY ??= "test-encryption-key";

const suffix = Math.random().toString(36).slice(2, 8);
const testProvider = activeProvider();

after(async () => {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: `pipeline-${suffix}` } } });
  await prisma.webhookEvent.deleteMany({ where: { externalEventId: { startsWith: `wamid.pipe.${suffix}` } } });
  await prisma.$disconnect();
});

/**
 * End-to-end pipeline test: webhook -> persist -> normalize -> automation -> AI
 * (mock provider) -> outbound (simulator provider). Nothing leaves the machine.
 */
async function setup() {
  const organization = await prisma.organization.create({
    data: { name: "Pipeline Test", slug: `pipeline-${suffix}-${Math.random().toString(36).slice(2, 7)}` },
  });

  const account = await prisma.whatsAppAccount.create({
    data: {
      organizationId: organization.id,
      name: "Simulator account",
      accessToken: encryptSecret("sim-token"),
      status: "ACTIVE",
    },
  });

  const phoneNumber = await prisma.whatsAppPhoneNumber.create({
    data: {
      organizationId: organization.id,
      whatsappAccountId: account.id,
      phoneNumberId: `pipe-pn-${suffix}-${Math.random().toString(36).slice(2, 7)}`,
      displayPhoneNumber: "+15550109999",
      status: "CONNECTED",
      providerMode: "simulator",
    },
  });

  await bootstrapOrganizationDefaults({ organizationId: organization.id });
  await prisma.automation.updateMany({
    where: { organizationId: organization.id, name: "Refund requests to a human" },
    data: { isActive: true },
  });

  return { organization, phoneNumber };
}

function inboundPayload({ phoneNumberId, waId, wamid, text }) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: `WABA_PIPE_${suffix}`,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "+15550109999", phone_number_id: phoneNumberId },
              contacts: [{ profile: { name: "Pipe Tester" }, wa_id: waId }],
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

test(
  "a normal message is answered by the AI through the simulator provider",
  { skip: testProvider === "mock" ? false : "requires the mock AI provider (unset AI_API_KEY)" },
  async () => {
    const { organization, phoneNumber } = await setup();

    const payload = inboundPayload({
      phoneNumberId: phoneNumber.phoneNumberId,
      waId: "15550100001",
      wamid: `wamid.pipe.${suffix}.1`,
      text: "Hello, do you have this in blue?",
    });

    const received = await handleWhatsAppWebhook({ rawBody: JSON.stringify(payload), payload, headers: {} });
    assert.equal(received.processed, 1);

    const conversation = await prisma.conversation.findFirst({
      where: { organizationId: organization.id },
    });
    assert.equal(conversation.unreadCount, 1);

    const contact = await prisma.contact.findFirst({ where: { organizationId: organization.id } });

    const result = await processInboundEvent({
      organizationId: organization.id,
      type: "MESSAGE_RECEIVED",
      conversationId: conversation.id,
      contactId: contact.id,
      text: "Hello, do you have this in blue?",
    });

    assert.equal(result.ai.replied, true);

    const messages = await prisma.message.findMany({
      where: { organizationId: organization.id },
      orderBy: { timestamp: "asc" },
    });

    assert.equal(messages.length, 2);
    assert.equal(messages[0].direction, "inbound");
    assert.equal(messages[1].direction, "outbound");
    assert.equal(messages[1].status, "sent");
    assert.match(messages[1].externalMessageId, /^sim_/);
    assert.match(messages[1].text, /mock AI provider/);

    // The agent's audit entry records the tool it used.
    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: organization.id, action: "ai.reply" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(audit);
    assert.equal(audit.actorType, "ai");
    assert.equal(audit.metadata.toolCalls[0].name, "get_contact");
  },
);

test(
  "an automation hands the conversation to a human and the AI stays out",
  { skip: testProvider === "mock" ? false : "requires the mock AI provider (unset AI_API_KEY)" },
  async () => {
    const { organization, phoneNumber } = await setup();

    const payload = inboundPayload({
      phoneNumberId: phoneNumber.phoneNumberId,
      waId: "15550100002",
      wamid: `wamid.pipe.${suffix}.2`,
      text: "I want a refund please",
    });

    await handleWhatsAppWebhook({ rawBody: JSON.stringify(payload), payload, headers: {} });

    const conversation = await prisma.conversation.findFirst({
      where: { organizationId: organization.id },
    });
    const contact = await prisma.contact.findFirst({ where: { organizationId: organization.id } });

    const result = await processInboundEvent({
      organizationId: organization.id,
      type: "MESSAGE_RECEIVED",
      conversationId: conversation.id,
      contactId: contact.id,
      text: "I want a refund please",
    });

    assert.equal(result.automations.handoff, true);
    assert.equal(result.ai.skipped, "automation-acted");

    const after = await prisma.conversation.findUnique({ where: { id: conversation.id } });
    assert.equal(after.mode, "human");
    assert.equal(after.status, "pending");

    const runs = await prisma.automationRun.findMany({ where: { organizationId: organization.id } });
    assert.equal(runs.length, 1);
    assert.equal(runs[0].status, "success");
    assert.deepEqual(
      runs[0].result.actions.map((action) => action.type),
      ["handoff_human", "send_message"],
    );
  },
);

test(
  "AI mode is respected: a human-owned conversation gets no AI reply",
  { skip: testProvider === "mock" ? false : "requires the mock AI provider (unset AI_API_KEY)" },
  async () => {
    const { organization, phoneNumber } = await setup();

    const payload = inboundPayload({
      phoneNumberId: phoneNumber.phoneNumberId,
      waId: "15550100003",
      wamid: `wamid.pipe.${suffix}.3`,
      text: "are you there?",
    });

    await handleWhatsAppWebhook({ rawBody: JSON.stringify(payload), payload, headers: {} });

    const conversation = await prisma.conversation.findFirst({
      where: { organizationId: organization.id },
    });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { mode: "human" } });

    const result = await runAgentForConversation({
      organizationId: organization.id,
      conversationId: conversation.id,
    });

    assert.equal(result.skipped, "not-ai-mode");

    const messages = await prisma.message.findMany({ where: { organizationId: organization.id } });
    assert.equal(messages.length, 1, "only the inbound message should exist");
  },
);
