import test, { after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/db/prisma.js";
import {
  connectMetaNumber,
  createAccount,
  discoverMetaNumbers,
} from "../src/services/whatsapp/accounts.js";
import { runWhatsAppDiagnostics } from "../src/services/whatsapp/diagnostics.js";
import { simulateInboundMessage } from "../src/services/whatsapp/testing.js";
import { updateCredentialSettings } from "../src/services/settings/index.js";

process.env.ENCRYPTION_KEY ??= "test-encryption-key";

const suffix = Math.random().toString(36).slice(2, 8);
const wabaId = `WABA_CONNECT_${suffix}`;
const numbers = {
  PN_ONE: {
    id: `PN_ONE_${suffix}`,
    display_phone_number: "+15550001001",
    verified_name: "Test Number One",
    status: "CONNECTED",
    quality_rating: "GREEN",
  },
  PN_TWO: {
    id: `PN_TWO_${suffix}`,
    display_phone_number: "+15550001002",
    verified_name: "Test Number Two",
    status: "CONNECTED",
    quality_rating: "GREEN",
  },
};

after(async () => {
  await prisma.$disconnect();
});

function json(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function installMetaMock() {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    const path = url.pathname;
    const wabaPath = `/v21.0/${wabaId}`;

    if (path.endsWith("/phone_numbers")) {
      return json({ data: Object.values(numbers) });
    }
    if (path.endsWith("/message_templates")) {
      return json({ data: [] });
    }
    if (path.endsWith("/subscribed_apps")) {
      return json({ data: [{ id: "app-test", name: "Test App" }] });
    }
    if (path === wabaPath) {
      return json({ id: wabaId, name: "Test WABA" });
    }
    for (const number of Object.values(numbers)) {
      if (path === `/v21.0/${number.id}`) return json(number);
    }
    throw new Error(`Unexpected Graph call: ${path}`);
  };
  return () => {
    globalThis.fetch = original;
  };
}

async function setupOrg() {
  return prisma.organization.create({
    data: { name: "Connection Test Org", slug: `wa-connect-${suffix}` },
  });
}

async function cleanup(organizationId) {
  await prisma.webhookEvent.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });
}

test("Meta discovery reads a WABA and connect reuses one account for several numbers", async (t) => {
  const organization = await setupOrg();
  t.after(() => cleanup(organization.id));
  const restore = installMetaMock();
  t.after(restore);

  const discovered = await discoverMetaNumbers({
    organizationId: organization.id,
    accessToken: "EAAG-connect-test",
    wabaId,
  });
  assert.equal(discovered.waba.name, "Test WABA");
  assert.equal(discovered.phoneNumbers.length, 2);
  assert.equal(discovered.tokenSource, "input");

  const first = await connectMetaNumber({
    organizationId: organization.id,
    accessToken: "EAAG-connect-test",
    wabaId,
    phoneNumberId: numbers.PN_ONE.id,
  });
  assert.equal(first.displayPhoneNumber, "+15550001001");
  assert.equal(first.account.wabaId, wabaId);

  const second = await connectMetaNumber({
    organizationId: organization.id,
    wabaId,
    phoneNumberId: numbers.PN_TWO.id,
  });
  assert.equal(second.displayPhoneNumber, "+15550001002");

  const accounts = await prisma.whatsAppAccount.findMany({
    where: { organizationId: organization.id },
  });
  assert.equal(accounts.length, 1, "one account per WABA");

  const connected = await prisma.whatsAppPhoneNumber.findMany({
    where: { organizationId: organization.id },
  });
  assert.equal(connected.length, 2);

  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: organization.id },
  });
  assert.ok(settings?.metaAccessToken?.startsWith("enc.v1"), "token is encrypted at rest");
});

test("diagnostics reports the Meta checks without leaking the token", async (t) => {
  const organization = await setupOrg();
  t.after(() => cleanup(organization.id));
  const restore = installMetaMock();
  t.after(restore);

  await updateCredentialSettings({
    organizationId: organization.id,
    data: { meta: { verifyToken: "diagnostics-verify-token" } },
  });

  const number = await connectMetaNumber({
    organizationId: organization.id,
    accessToken: "EAAG-diagnostics-test",
    wabaId,
    phoneNumberId: numbers.PN_ONE.id,
  });

  const report = await runWhatsAppDiagnostics({
    organizationId: organization.id,
    phoneNumberId: number.id,
  });
  const byId = Object.fromEntries(report.checks.map((entry) => [entry.id, entry]));

  assert.equal(report.ok, true);
  assert.equal(byId["access-token"].status, "ok");
  assert.equal(byId["phone-number"].status, "ok");
  assert.equal(byId.waba.status, "ok");
  assert.equal(byId.subscription.status, "ok");
  assert.ok(!JSON.stringify(report).includes("EAAG-diagnostics-test"));
});

test("simulated inbound messages reach the real contact/conversation pipeline", async (t) => {
  const organization = await setupOrg();
  t.after(() => cleanup(organization.id));

  const number = await createAccount({
    organizationId: organization.id,
    name: "Simulator",
    phoneNumberId: `sim_${suffix}`,
    displayPhoneNumber: "+10000000001",
    providerMode: "simulator",
  });

  const result = await simulateInboundMessage({
    organizationId: organization.id,
    phoneNumberId: number.id,
    from: "15550001111",
    text: "Simulated hello",
  });

  assert.equal(result.processed, 1);
  assert.ok(result.message?.conversationId);

  const messages = await prisma.message.findMany({
    where: { organizationId: organization.id },
  });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].direction, "inbound");
  assert.equal(messages[0].text, "Simulated hello");

  await assert.rejects(
    simulateInboundMessage({
      organizationId: organization.id,
      phoneNumberId: number.id,
      from: "15550001111",
      text: "",
    }),
    /text is required/,
  );
});
