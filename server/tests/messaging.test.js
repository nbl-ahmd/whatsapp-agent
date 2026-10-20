import test, { after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/db/prisma.js";
import { sendMessage } from "../src/services/messages/outbound.js";

process.env.ENCRYPTION_KEY ??= "test-encryption-key";

const suffix = Math.random().toString(36).slice(2, 8);
const createdOrganizations = [];

after(async () => {
  for (const organizationId of createdOrganizations) {
    await prisma.organization.delete({ where: { id: organizationId } }).catch(() => null);
  }
  await prisma.$disconnect();
});

async function createSimulatorTenant(label) {
  const organization = await prisma.organization.create({
    data: { name: `Messaging ${label}`, slug: `messaging-test-${label}-${suffix}` },
  });
  createdOrganizations.push(organization.id);

  const account = await prisma.whatsAppAccount.create({
    data: { organizationId: organization.id, name: `Account ${label}`, status: "ACTIVE" },
  });

  const number = await prisma.whatsAppPhoneNumber.create({
    data: {
      organizationId: organization.id,
      whatsappAccountId: account.id,
      phoneNumberId: `sim-number-${label}-${suffix}`,
      displayPhoneNumber: "+15550100",
      providerMode: "simulator",
      status: "CONNECTED",
    },
  });

  return { organization, account, number };
}

test("image messages persist their media and reach the simulator provider", async () => {
  const { organization, number } = await createSimulatorTenant("image");

  const result = await sendMessage({
    organizationId: organization.id,
    phoneNumberId: number.phoneNumberId,
    to: "+15550111",
    type: "image",
    media: { link: "https://cdn.example.test/photo.jpg", caption: "Your receipt" },
  });

  assert.equal(result.message.type, "image");
  assert.equal(result.message.direction, "outbound");
  assert.equal(result.message.status, "sent");
  assert.equal(result.message.media.link, "https://cdn.example.test/photo.jpg");
  assert.equal(result.message.text, "Your receipt");
  assert.equal(result.providerResponse.simulator, true);
  assert.ok(result.message.externalMessageId.startsWith("sim_"));
});

test("document and template messages use the same outbound path", async () => {
  const { organization, number } = await createSimulatorTenant("types");

  const document = await sendMessage({
    organizationId: organization.id,
    phoneNumberId: number.phoneNumberId,
    to: "+15550112",
    type: "document",
    media: {
      link: "https://cdn.example.test/invoice.pdf",
      filename: "invoice.pdf",
      caption: "Invoice 42",
    },
  });
  assert.equal(document.message.type, "document");
  assert.equal(document.message.media.filename, "invoice.pdf");

  const template = await sendMessage({
    organizationId: organization.id,
    phoneNumberId: number.phoneNumberId,
    to: "+15550113",
    type: "template",
    template: { name: "order_update", language: "en_US" },
  });
  assert.equal(template.message.type, "template");
  assert.equal(template.message.template.name, "order_update");
  assert.equal(template.message.status, "sent");
});

test("invalid media and text payloads are rejected before persisting", async () => {
  const { organization, number } = await createSimulatorTenant("invalid");

  await assert.rejects(
    () =>
      sendMessage({
        organizationId: organization.id,
        phoneNumberId: number.phoneNumberId,
        to: "+15550114",
        type: "image",
        media: {},
      }),
    /media link or a media id/,
  );

  await assert.rejects(
    () =>
      sendMessage({
        organizationId: organization.id,
        phoneNumberId: number.phoneNumberId,
        to: "+15550115",
        type: "text",
        text: "   ",
      }),
    /text is required/,
  );

  const count = await prisma.message.count({ where: { organizationId: organization.id } });
  assert.equal(count, 0);
});
