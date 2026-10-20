import test from "node:test";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { decryptSecret, isEncrypted } from "../src/lib/crypto.js";
import { tenantWhere } from "../src/lib/tenant.js";

for (const file of [".env", "../.env", "server/.env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // environment variables may be injected directly
  }
}

const { DATABASE_URL } = process.env;

test(
  "multi-tenant isolation against a seeded database",
  { skip: DATABASE_URL ? false : "DATABASE_URL is not configured" },
  async (t) => {
    process.env.ENCRYPTION_KEY ??= "test-encryption-key";

    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: DATABASE_URL }),
    });
    t.after(async () => {
      await prisma.$disconnect();
    });

    const acme = await prisma.organization.findUnique({ where: { slug: "acme" } });
    const globex = await prisma.organization.findUnique({ where: { slug: "globex" } });
    if (!acme || !globex) {
      t.skip("seed data not present - run `npm run db:seed` first");
      return;
    }

    await t.test("organization-scoped queries only return own records", async () => {
      const contacts = await prisma.contact.findMany({ where: tenantWhere(acme.id) });
      assert.ok(contacts.length > 0);
      assert.ok(contacts.every((contact) => contact.organizationId === acme.id));
    });

    await t.test("cross-tenant record lookup returns null", async () => {
      const globexContact = await prisma.contact.findFirst({
        where: { organizationId: globex.id },
      });
      assert.ok(globexContact);

      const leaked = await prisma.contact.findFirst({
        where: tenantWhere(acme.id, { id: globexContact.id }),
      });
      assert.equal(leaked, null);
    });

    await t.test("messages are isolated per organization", async () => {
      const acmeMessages = await prisma.message.findMany({ where: tenantWhere(acme.id) });
      assert.ok(acmeMessages.length > 0);
      assert.ok(acmeMessages.every((message) => message.organizationId === acme.id));
    });

    await t.test("credentials are encrypted at rest", async () => {
      const account = await prisma.whatsAppAccount.findFirst({
        where: tenantWhere(acme.id),
      });
      assert.ok(account);
      assert.equal(isEncrypted(account.accessToken), true);
      assert.equal(decryptSecret(account.accessToken), "acme-test-access-token");
    });
  },
);
