import test, { after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/db/prisma.js";
import {
  getAiConfig,
  getCredentialSettings,
  getMetaConfig,
  listWebhookAppSecrets,
  listWebhookVerifyTokens,
  updateCredentialSettings,
} from "../src/services/settings/index.js";

process.env.ENCRYPTION_KEY ??= "test-encryption-key";

const suffix = Math.random().toString(36).slice(2, 8);
const createdOrganizations = [];

after(async () => {
  for (const organizationId of createdOrganizations) {
    await prisma.organization.delete({ where: { id: organizationId } }).catch(() => null);
  }
  await prisma.$disconnect();
});

async function createTenant(label) {
  const organization = await prisma.organization.create({
    data: { name: `Settings ${label}`, slug: `settings-test-${label}-${suffix}` },
  });
  createdOrganizations.push(organization.id);
  return organization;
}

test("BYOK secrets are encrypted at rest and never serialized to clients", async () => {
  const organization = await createTenant("encrypt");
  const appSecret = "meta-app-secret-value";
  const aiKey = "sk-test-secret-value";

  await updateCredentialSettings({
    organizationId: organization.id,
    data: {
      meta: {
        appSecret,
        verifyToken: "verify-me",
        accessToken: "EAAG-test-token",
        graphApiVersion: "v22.0",
      },
      ai: { provider: "openai", apiKey: aiKey, model: "gpt-test" },
    },
  });

  const row = await prisma.organizationSettings.findUnique({
    where: { organizationId: organization.id },
  });

  assert.ok(row.metaAppSecret.startsWith("enc.v1:"));
  assert.ok(!row.metaAppSecret.includes(appSecret));
  assert.ok(row.aiApiKey.startsWith("enc.v1:"));
  assert.ok(!row.aiApiKey.includes(aiKey));

  const serialized = await getCredentialSettings({ organizationId: organization.id });
  const json = JSON.stringify(serialized);
  assert.ok(!json.includes(appSecret));
  assert.ok(!json.includes(aiKey));
  assert.ok(!json.includes("enc.v1:"));
  assert.equal(serialized.meta.appSecretConfigured, true);
  assert.equal(serialized.meta.source.appSecret, "settings");
  assert.equal(serialized.ai.provider, "openai");
  assert.equal(serialized.ai.model, "gpt-test");

  const meta = await getMetaConfig({ organizationId: organization.id });
  assert.equal(meta.appSecret, appSecret);
  assert.equal(meta.verifyToken, "verify-me");
  assert.equal(meta.accessToken, "EAAG-test-token");
  assert.equal(meta.graphApiVersion, "v22.0");

  const ai = await getAiConfig({ organizationId: organization.id });
  assert.equal(ai.apiKey, aiKey);
  assert.equal(ai.provider, "openai");
});

test("clearing a stored secret removes it and falls back to env", async () => {
  const organization = await createTenant("clear");

  await updateCredentialSettings({
    organizationId: organization.id,
    data: { meta: { appSecret: "temporary-secret" } },
  });

  await updateCredentialSettings({
    organizationId: organization.id,
    data: { meta: { appSecret: "" } },
  });

  const row = await prisma.organizationSettings.findUnique({
    where: { organizationId: organization.id },
  });
  assert.equal(row.metaAppSecret, null);

  const serialized = await getCredentialSettings({ organizationId: organization.id });
  assert.equal(serialized.meta.stored.appSecret, false);
  assert.notEqual(serialized.meta.source.appSecret, "settings");
});

test("webhook verification accepts tokens and app secrets stored per organization", async () => {
  const organization = await createTenant("webhook");

  await updateCredentialSettings({
    organizationId: organization.id,
    data: {
      meta: { appSecret: "signing-secret", verifyToken: "handshake-token" },
    },
  });

  const tokens = await listWebhookVerifyTokens();
  assert.ok(tokens.includes("handshake-token"));

  const secrets = await listWebhookAppSecrets({ phoneNumberIds: [] });
  assert.ok(secrets.includes("signing-secret"));
});

test("an unsupported AI provider is rejected", async () => {
  const organization = await createTenant("provider");

  await assert.rejects(
    () =>
      updateCredentialSettings({
        organizationId: organization.id,
        data: { ai: { provider: "not-a-provider" } },
      }),
    /must be one of/,
  );
});
