// Seed script: two demo organizations with a usable message history.
//
// Everything here is idempotent (upsert by a stable id), so `npm run db:seed`
// can be re-run at any time. The Acme phone number runs in "simulator" provider
// mode, which means the whole pipeline works locally without Meta credentials.
//
// Demo logins (password is the same for every seeded user): password123

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { encryptSecret } from "../src/lib/crypto.js";

// Same lookup order as src/config/env.js so the seed works from the repo root
// and from the server directory.
for (const file of [".env", "../.env", "server/.env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Environment variables may be injected by the platform.
  }
}

const { DATABASE_URL, ENCRYPTION_KEY } = process.env;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}

if (!ENCRYPTION_KEY) {
  console.error("ENCRYPTION_KEY is not set. Generate one with `openssl rand -hex 32`.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });

const DEMO_PASSWORD = "password123";

// scrypt hash of DEMO_PASSWORD, computed once so the seed stays fast.
const {
  hashPassword,
  verifyPassword,
} = await import("../src/lib/password.js");
const { bootstrapOrganizationDefaults } = await import("../src/services/organizations/service.js");

const passwordHash = await hashPassword(DEMO_PASSWORD);
if (!(await verifyPassword(DEMO_PASSWORD, passwordHash))) {
  throw new Error("Password hashing is not working");
}

const hoursAgo = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000);

async function upsertOrganization({ id, name, slug, plan }) {
  return prisma.organization.upsert({
    where: { id },
    update: { name, slug, plan },
    create: { id, name, slug, plan },
  });
}

async function upsertUser({ id, organizationId, email, name, role }) {
  return prisma.user.upsert({
    where: { id },
    update: { name, role, passwordHash, isActive: true },
    create: { id, organizationId, email, name, role, passwordHash, isActive: true },
  });
}

async function upsertAccount({ id, organizationId, name, wabaId, status, accessToken = null }) {
  return prisma.whatsAppAccount.upsert({
    where: { id },
    update: { name, wabaId, status, accessToken: accessToken ? encryptSecret(accessToken) : null },
    create: {
      id,
      organizationId,
      name,
      wabaId,
      status,
      accessToken: accessToken ? encryptSecret(accessToken) : null,
    },
  });
}

async function upsertPhoneNumber({
  id,
  organizationId,
  whatsappAccountId,
  phoneNumberId,
  displayPhoneNumber,
  verifiedName,
  status,
  providerMode,
  qualityRating = null,
}) {
  return prisma.whatsAppPhoneNumber.upsert({
    where: { id },
    update: { displayPhoneNumber, verifiedName, status, providerMode, qualityRating },
    create: {
      id,
      organizationId,
      whatsappAccountId,
      phoneNumberId,
      displayPhoneNumber,
      verifiedName,
      status,
      providerMode,
      qualityRating,
    },
  });
}

async function upsertContact({ id, organizationId, waId, name, email = null, locale = "en", tags = [] }) {
  return prisma.contact.upsert({
    where: { id },
    update: { name, tags, lastSeenAt: new Date() },
    create: {
      id,
      organizationId,
      waId,
      phone: waId,
      name,
      profileName: name,
      email,
      locale,
      tags,
      lastSeenAt: new Date(),
    },
  });
}

async function upsertConversation({
  id,
  organizationId,
  contactId,
  phoneNumberId,
  mode,
  status,
  assignedUserId = null,
  unreadCount = 0,
  lastMessageAt,
  lastMessagePreview,
  variables = null,
}) {
  return prisma.conversation.upsert({
    where: { id },
    update: { mode, status, unreadCount, lastMessageAt, lastMessagePreview, assignedUserId },
    create: {
      id,
      organizationId,
      contactId,
      phoneNumberId,
      mode,
      status,
      assignedUserId,
      unreadCount,
      lastMessageAt,
      lastMessagePreview,
      variables,
    },
  });
}

async function upsertMessage({
  id,
  organizationId,
  conversationId,
  contactId,
  phoneNumberId,
  direction,
  status,
  text,
  externalMessageId,
  timestamp,
}) {
  return prisma.message.upsert({
    where: { externalMessageId },
    update: { status, text },
    create: {
      id,
      organizationId,
      conversationId,
      contactId,
      phoneNumberId,
      direction,
      type: "text",
      status,
      text,
      externalMessageId,
      timestamp,
    },
  });
}

async function seedAcme() {
  // Remove workflows created by earlier seed versions so re-seeding is a clean
  // state (runs cascade with their automation).
  await prisma.automation.deleteMany({
    where: {
      organizationId: "org_acme",
      name: { in: ["Welcome new contact"] },
    },
  });

  const organization = await upsertOrganization({
    id: "org_acme",
    name: "Acme Retail",
    slug: "acme",
    plan: "pro",
  });

  const owner = await upsertUser({
    id: "user_acme_owner",
    organizationId: organization.id,
    email: "owner@acme.test",
    name: "Ada Owner",
    role: "OWNER",
  });
  const agent = await upsertUser({
    id: "user_acme_agent",
    organizationId: organization.id,
    email: "agent@acme.test",
    name: "Sam Agent",
    role: "AGENT",
  });

  const account = await upsertAccount({
    id: "wa_acme",
    organizationId: organization.id,
    name: "Acme Cloud API",
    wabaId: "WABA_ACME",
    status: "ACTIVE",
    accessToken: "acme-test-access-token",
  });

  const number = await upsertPhoneNumber({
    id: "pn_acme",
    organizationId: organization.id,
    whatsappAccountId: account.id,
    phoneNumberId: "100000000000001",
    displayPhoneNumber: "+1 555 010 0001",
    verifiedName: "Acme Support",
    status: "CONNECTED",
    providerMode: "simulator",
    qualityRating: "GREEN",
  });

  const alice = await upsertContact({
    id: "contact_acme_alice",
    organizationId: organization.id,
    waId: "15550001111",
    name: "Alice Nguyen",
    email: "alice@example.com",
    tags: ["customer", "vip"],
  });
  const bob = await upsertContact({
    id: "contact_acme_bob",
    organizationId: organization.id,
    waId: "15550002222",
    name: "Bob Martin",
    tags: ["lead"],
  });
  const priya = await upsertContact({
    id: "contact_acme_priya",
    organizationId: organization.id,
    waId: "15550003333",
    name: "Priya Shah",
    tags: ["customer"],
  });

  const aliceThread = await upsertConversation({
    id: "conv_acme_alice",
    organizationId: organization.id,
    contactId: alice.id,
    phoneNumberId: number.id,
    mode: "ai",
    status: "open",
    unreadCount: 2,
    lastMessageAt: hoursAgo(0.2),
    lastMessagePreview: "Can you check my order status?",
  });

  await Promise.all([
    upsertMessage({
      id: "msg_acme_alice_1",
      organizationId: organization.id,
      conversationId: aliceThread.id,
      contactId: alice.id,
      phoneNumberId: number.id,
      direction: "inbound",
      status: "received",
      text: "Hi! Do you ship to Canada?",
      externalMessageId: "wamid.seed.acme.1",
      timestamp: hoursAgo(26),
    }),
    upsertMessage({
      id: "msg_acme_alice_2",
      organizationId: organization.id,
      conversationId: aliceThread.id,
      contactId: alice.id,
      phoneNumberId: number.id,
      direction: "outbound",
      status: "read",
      text: "Hi Alice! Yes - we ship to Canada in 3-5 business days.",
      externalMessageId: "wamid.seed.acme.2",
      timestamp: hoursAgo(25),
    }),
    upsertMessage({
      id: "msg_acme_alice_3",
      organizationId: organization.id,
      conversationId: aliceThread.id,
      contactId: alice.id,
      phoneNumberId: number.id,
      direction: "inbound",
      status: "received",
      text: "Can you check my order status?",
      externalMessageId: "wamid.seed.acme.3",
      timestamp: hoursAgo(0.2),
    }),
  ]);

  const bobThread = await upsertConversation({
    id: "conv_acme_bob",
    organizationId: organization.id,
    contactId: bob.id,
    phoneNumberId: number.id,
    mode: "human",
    status: "pending",
    assignedUserId: agent.id,
    unreadCount: 1,
    lastMessageAt: hoursAgo(1.5),
    lastMessagePreview: "I need a refund for order #1042",
    variables: { orderId: "1042" },
  });

  await upsertMessage({
    id: "msg_acme_bob_1",
    organizationId: organization.id,
    conversationId: bobThread.id,
    contactId: bob.id,
    phoneNumberId: number.id,
    direction: "inbound",
    status: "received",
    text: "I need a refund for order #1042",
    externalMessageId: "wamid.seed.acme.4",
    timestamp: hoursAgo(1.5),
  });

  const priyaThread = await upsertConversation({
    id: "conv_acme_priya",
    organizationId: organization.id,
    contactId: priya.id,
    phoneNumberId: number.id,
    mode: "paused",
    status: "closed",
    unreadCount: 0,
    lastMessageAt: hoursAgo(72),
    lastMessagePreview: "Thanks, that fixed it!",
  });

  await upsertMessage({
    id: "msg_acme_priya_1",
    organizationId: organization.id,
    conversationId: priyaThread.id,
    contactId: priya.id,
    phoneNumberId: number.id,
    direction: "inbound",
    status: "received",
    text: "Thanks, that fixed it!",
    externalMessageId: "wamid.seed.acme.5",
    timestamp: hoursAgo(72),
  });

  await bootstrapOrganizationDefaults({ organizationId: organization.id });

  // Make the refund workflow live so the automation path is visible in the demo.
  await prisma.automation.updateMany({
    where: { organizationId: organization.id, name: "Refund requests to a human" },
    data: { isActive: true },
  });

  await prisma.integration.upsert({
    where: { organizationId_provider_name: { organizationId: organization.id, provider: "shopify", name: "Acme store" } },
    update: { status: "inactive" },
    create: {
      organizationId: organization.id,
      provider: "shopify",
      name: "Acme store",
      category: "ecommerce",
      status: "inactive",
      isActive: false,
      config: { shopDomain: "acme.myshopify.com" },
      credentials: encryptSecret(JSON.stringify({ accessToken: "shpat_example" })),
    },
  });

  await prisma.webhookEvent.upsert({
    where: { externalEventId: "seed-webhook-event-acme" },
    update: {},
    create: {
      organizationId: organization.id,
      source: "whatsapp",
      externalEventId: "seed-webhook-event-acme",
      eventType: "MESSAGE_RECEIVED",
      status: "processed",
      payload: { seeded: true, entry: [{ changes: [{ field: "messages" }] }] },
      receivedAt: hoursAgo(0.2),
      processedAt: hoursAgo(0.2),
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: organization.id,
      userId: owner.id,
      actorType: "user",
      action: "organization.seeded",
      entityType: "Organization",
      entityId: organization.id,
      metadata: { demo: true },
    },
  });

  return { organization, owner, agent };
}

async function seedGlobex() {
  const organization = await upsertOrganization({
    id: "org_globex",
    name: "Globex Fitness",
    slug: "globex",
    plan: "free",
  });

  await upsertUser({
    id: "user_globex_owner",
    organizationId: organization.id,
    email: "owner@globex.test",
    name: "Grace Owner",
    role: "OWNER",
  });

  const account = await upsertAccount({
    id: "wa_globex",
    organizationId: organization.id,
    name: "Globex Cloud API",
    wabaId: "WABA_GLOBEX",
    status: "PENDING",
  });

  const number = await upsertPhoneNumber({
    id: "pn_globex",
    organizationId: organization.id,
    whatsappAccountId: account.id,
    phoneNumberId: "100000000000002",
    displayPhoneNumber: "+1 555 010 0002",
    verifiedName: "Globex Studio",
    status: "PENDING",
    providerMode: "meta",
  });

  const carol = await upsertContact({
    id: "contact_globex_carol",
    organizationId: organization.id,
    waId: "15550004444",
    name: "Carol Diaz",
    tags: ["trial"],
  });

  const thread = await upsertConversation({
    id: "conv_globex_carol",
    organizationId: organization.id,
    contactId: carol.id,
    phoneNumberId: number.id,
    mode: "ai",
    status: "open",
    unreadCount: 1,
    lastMessageAt: hoursAgo(3),
    lastMessagePreview: "Is the 6am class still open?",
  });

  await upsertMessage({
    id: "msg_globex_carol_1",
    organizationId: organization.id,
    conversationId: thread.id,
    contactId: carol.id,
    phoneNumberId: number.id,
    direction: "inbound",
    status: "received",
    text: "Is the 6am class still open?",
    externalMessageId: "wamid.seed.globex.1",
    timestamp: hoursAgo(3),
  });

  await bootstrapOrganizationDefaults({ organizationId: organization.id });

  return { organization };
}

async function main() {
  const acme = await seedAcme();
  const globex = await seedGlobex();

  console.log("Seed complete.");
  console.log(`  ${acme.organization.name}: owner@acme.test / ${DEMO_PASSWORD}`);
  console.log(`  ${globex.organization.name}: owner@globex.test / ${DEMO_PASSWORD}`);
  console.log("  Acme's number runs in simulator mode (no Meta credentials needed).");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
