import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { encryptSecret } from "../server/src/lib/crypto.js";

try {
  process.loadEnvFile();
} catch {
  // environment variables may be injected directly
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run the seed.");
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function seedAcme() {
  const organizationId = "org_acme";

  await prisma.organization.upsert({
    where: { id: organizationId },
    update: { name: "Acme Corp", slug: "acme", plan: "pro" },
    create: {
      id: organizationId,
      name: "Acme Corp",
      slug: "acme",
      plan: "pro",
      settings: { timezone: "UTC" },
    },
  });

  await prisma.user.upsert({
    where: { id: "user_acme_owner" },
    update: {},
    create: {
      id: "user_acme_owner",
      organizationId,
      email: "owner@acme.test",
      name: "Acme Owner",
      role: "OWNER",
    },
  });

  await prisma.user.upsert({
    where: { id: "user_acme_agent" },
    update: {},
    create: {
      id: "user_acme_agent",
      organizationId,
      email: "agent@acme.test",
      name: "Acme Agent",
      role: "AGENT",
    },
  });

  await prisma.whatsAppAccount.upsert({
    where: { id: "wa_acme" },
    update: {},
    create: {
      id: "wa_acme",
      organizationId,
      name: "Acme WhatsApp",
      wabaId: "WABA_ACME_001",
      accessToken: encryptSecret("acme-test-access-token"),
      appSecret: encryptSecret("acme-test-app-secret"),
      webhookVerifyToken: encryptSecret("acme-test-verify-token"),
      status: "ACTIVE",
    },
  });

  await prisma.whatsAppPhoneNumber.upsert({
    where: { id: "pn_acme" },
    update: {},
    create: {
      id: "pn_acme",
      organizationId,
      whatsappAccountId: "wa_acme",
      phoneNumberId: "100000000000001",
      displayPhoneNumber: "+15550000001",
      verifiedName: "Acme Support",
      qualityRating: "GREEN",
      status: "CONNECTED",
    },
  });

  const contacts = [
    { id: "contact_acme_alice", waId: "15551230001", name: "Alice Johnson", tags: ["customer"] },
    { id: "contact_acme_bob", waId: "15551230002", name: "Bob Smith", tags: ["lead", "vip"] },
  ];
  for (const contact of contacts) {
    await prisma.contact.upsert({
      where: { id: contact.id },
      update: {},
      create: { organizationId, ...contact },
    });
  }

  await prisma.conversation.upsert({
    where: { id: "conv_acme_alice" },
    update: {},
    create: {
      id: "conv_acme_alice",
      organizationId,
      contactId: "contact_acme_alice",
      phoneNumberId: "pn_acme",
      mode: "ai",
      status: "open",
      lastMessageAt: new Date("2026-01-01T10:05:00Z"),
      lastMessagePreview: "When are you open?",
    },
  });

  await prisma.conversation.upsert({
    where: { id: "conv_acme_bob" },
    update: {},
    create: {
      id: "conv_acme_bob",
      organizationId,
      contactId: "contact_acme_bob",
      phoneNumberId: "pn_acme",
      assignedUserId: "user_acme_agent",
      mode: "human",
      status: "open",
      lastMessageAt: new Date("2026-01-01T11:05:00Z"),
      lastMessagePreview: "I'd like to speak to a human.",
    },
  });

  const messages = [
    {
      id: "msg_acme_1",
      externalMessageId: "wamid.acme.seed.1",
      conversationId: "conv_acme_alice",
      contactId: "contact_acme_alice",
      direction: "inbound",
      type: "text",
      status: "received",
      text: "Hi, I have a question.",
      timestamp: new Date("2026-01-01T10:00:00Z"),
    },
    {
      id: "msg_acme_2",
      externalMessageId: "wamid.acme.seed.2",
      conversationId: "conv_acme_alice",
      contactId: "contact_acme_alice",
      direction: "outbound",
      type: "text",
      status: "delivered",
      text: "Hello! How can I help?",
      timestamp: new Date("2026-01-01T10:01:00Z"),
    },
    {
      id: "msg_acme_3",
      externalMessageId: "wamid.acme.seed.3",
      conversationId: "conv_acme_bob",
      contactId: "contact_acme_bob",
      direction: "inbound",
      type: "text",
      status: "received",
      text: "I'd like to speak to a human.",
      timestamp: new Date("2026-01-01T11:00:00Z"),
    },
  ];
  for (const message of messages) {
    await prisma.message.upsert({
      where: { id: message.id },
      update: {},
      create: {
        organizationId,
        phoneNumberId: "pn_acme",
        ...message,
      },
    });
  }

  await prisma.automation.upsert({
    where: { id: "auto_acme_welcome" },
    update: {},
    create: {
      id: "auto_acme_welcome",
      organizationId,
      name: "Welcome new contact",
      description: "Send a greeting when a new contact writes for the first time.",
      trigger: "MESSAGE_RECEIVED",
      conditions: [{ type: "equals", field: "conversation.isNew", value: true }],
      actions: [{ type: "send_message", text: "Welcome to Acme!" }],
      isActive: true,
    },
  });

  await prisma.automationRun.upsert({
    where: { id: "run_acme_1" },
    update: {},
    create: {
      id: "run_acme_1",
      organizationId,
      automationId: "auto_acme_welcome",
      conversationId: "conv_acme_alice",
      contactId: "contact_acme_alice",
      eventType: "MESSAGE_RECEIVED",
      status: "success",
      triggerPayload: { messageId: "msg_acme_1" },
      result: { sent: true },
      startedAt: new Date("2026-01-01T10:00:01Z"),
      finishedAt: new Date("2026-01-01T10:00:02Z"),
    },
  });

  await prisma.tool.upsert({
    where: { id: "tool_acme_get_contact" },
    update: {},
    create: {
      id: "tool_acme_get_contact",
      organizationId,
      name: "get_contact",
      description: "Look up a contact by id or WhatsApp id.",
      type: "internal",
      inputSchema: { type: "object", properties: { waId: { type: "string" } } },
      permission: "read",
    },
  });

  await prisma.tool.upsert({
    where: { id: "tool_acme_send_whatsapp_message" },
    update: {},
    create: {
      id: "tool_acme_send_whatsapp_message",
      organizationId,
      name: "send_whatsapp_message",
      description: "Send a WhatsApp text message to the current contact.",
      type: "internal",
      inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
      permission: "write",
    },
  });

  await prisma.aIAgent.upsert({
    where: { id: "agent_acme_support" },
    update: {},
    create: {
      id: "agent_acme_support",
      organizationId,
      name: "Support Agent",
      description: "Answers common support questions.",
      provider: "openai",
      model: "gpt-4o-mini",
      systemPrompt: "You are a helpful support agent for Acme Corp.",
      temperature: 0.3,
      maxTokens: 512,
      tools: {
        connect: [
          { id: "tool_acme_get_contact" },
          { id: "tool_acme_send_whatsapp_message" },
        ],
      },
    },
  });

  await prisma.integration.upsert({
    where: { id: "integration_acme_shopify" },
    update: {},
    create: {
      id: "integration_acme_shopify",
      organizationId,
      provider: "shopify",
      name: "Acme Store",
      category: "ecommerce",
      status: "active",
      isActive: true,
      config: { shopDomain: "acme.myshopify.com" },
      credentials: encryptSecret("shpat_acme_test_token"),
    },
  });

  await prisma.webhookEvent.upsert({
    where: { id: "webhook_acme_1" },
    update: {},
    create: {
      id: "webhook_acme_1",
      organizationId,
      source: "whatsapp",
      externalEventId: "wamid.acme.seed.1",
      eventType: "MESSAGE_RECEIVED",
      status: "processed",
      payload: { object: "whatsapp_business_account" },
      processedAt: new Date("2026-01-01T10:00:03Z"),
    },
  });

  await prisma.auditLog.upsert({
    where: { id: "audit_acme_1" },
    update: {},
    create: {
      id: "audit_acme_1",
      organizationId,
      userId: "user_acme_owner",
      actorType: "user",
      action: "organization.seeded",
      entityType: "Organization",
      entityId: organizationId,
      metadata: { source: "seed" },
    },
  });
}

async function seedGlobex() {
  const organizationId = "org_globex";

  await prisma.organization.upsert({
    where: { id: organizationId },
    update: { name: "Globex", slug: "globex" },
    create: { id: organizationId, name: "Globex", slug: "globex", plan: "free" },
  });

  await prisma.user.upsert({
    where: { id: "user_globex_owner" },
    update: {},
    create: {
      id: "user_globex_owner",
      organizationId,
      email: "owner@globex.test",
      name: "Globex Owner",
      role: "OWNER",
    },
  });

  await prisma.whatsAppAccount.upsert({
    where: { id: "wa_globex" },
    update: {},
    create: {
      id: "wa_globex",
      organizationId,
      name: "Globex WhatsApp",
      wabaId: "WABA_GLOBEX_001",
      status: "PENDING",
    },
  });

  await prisma.whatsAppPhoneNumber.upsert({
    where: { id: "pn_globex" },
    update: {},
    create: {
      id: "pn_globex",
      organizationId,
      whatsappAccountId: "wa_globex",
      phoneNumberId: "100000000000002",
      displayPhoneNumber: "+15550000002",
      status: "PENDING",
    },
  });

  await prisma.contact.upsert({
    where: { id: "contact_globex_carol" },
    update: {},
    create: {
      id: "contact_globex_carol",
      organizationId,
      waId: "15559990001",
      name: "Carol Danvers",
      tags: ["lead"],
    },
  });

  await prisma.conversation.upsert({
    where: { id: "conv_globex_carol" },
    update: {},
    create: {
      id: "conv_globex_carol",
      organizationId,
      contactId: "contact_globex_carol",
      phoneNumberId: "pn_globex",
      mode: "ai",
      status: "open",
    },
  });

  await prisma.message.upsert({
    where: { id: "msg_globex_1" },
    update: {},
    create: {
      id: "msg_globex_1",
      organizationId,
      conversationId: "conv_globex_carol",
      contactId: "contact_globex_carol",
      phoneNumberId: "pn_globex",
      externalMessageId: "wamid.globex.seed.1",
      direction: "inbound",
      type: "text",
      status: "received",
      text: "Hello Globex!",
    },
  });
}

async function main() {
  await seedAcme();
  await seedGlobex();
  console.log("Seed complete: organizations acme and globex.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
