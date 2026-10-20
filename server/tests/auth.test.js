import test, { after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/db/prisma.js";
import { createToken, verifyToken } from "../src/lib/tokens.js";
import { hashPassword, verifyPassword } from "../src/lib/password.js";
import { login, registerOrganization } from "../src/services/auth/service.js";

process.env.ENCRYPTION_KEY ??= "test-encryption-key";
process.env.AUTH_SECRET ??= "test-auth-secret";

const suffix = Math.random().toString(36).slice(2, 8);
const createdOrganizations = [];

after(async () => {
  for (const organizationId of createdOrganizations) {
    await prisma.organization.delete({ where: { id: organizationId } }).catch(() => null);
  }
  await prisma.organization.deleteMany({ where: { slug: { startsWith: `auth-test-${suffix}` } } });
  await prisma.$disconnect();
});

async function createTenant(domain) {
  const result = await registerOrganization({
    organizationName: `Auth Test ${domain}`,
    name: `Owner ${domain}`,
    email: `owner-${domain}-${suffix}@example.test`,
    password: "supersecret",
  });
  createdOrganizations.push(result.organization.id);
  return result;
}

test("passwords are hashed with scrypt and never stored in plaintext", async () => {
  const hash = await hashPassword("supersecret");
  assert.match(hash, /^scrypt\.v1:/);
  assert.ok(!hash.includes("supersecret"));
  assert.equal(await verifyPassword("supersecret", hash), true);
  assert.equal(await verifyPassword("wrong", hash), false);
});

test("tokens round-trip, reject tampering and expire", () => {
  const token = createToken({ userId: "user_1", organizationId: "org_1", role: "OWNER" });
  const claims = verifyToken(token);
  assert.equal(claims.userId, "user_1");
  assert.equal(claims.organizationId, "org_1");
  assert.equal(claims.role, "OWNER");

  const [header, payload] = token.split(".");
  assert.throws(
    () => verifyToken(`${header}.${payload}.tampered`),
    /Invalid session token/,
  );
  assert.throws(() => verifyToken("not-a-token"), /Malformed session token/);

  const expired = createToken(
    { userId: "user_1", organizationId: "org_1", role: "OWNER" },
    { ttlHours: -1 },
  );
  assert.throws(() => verifyToken(expired), /Session expired/);
});

test("registration bootstraps tools, an agent and example automations", async () => {
  const { organization, user } = await createTenant("bootstrap");

  const tools = await prisma.tool.count({ where: { organizationId: organization.id } });
  assert.ok(tools >= 7, "built-in tools should exist for a new organization");

  const agent = await prisma.aIAgent.findFirst({
    where: { organizationId: organization.id },
    include: { tools: true },
  });
  assert.ok(agent);
  assert.equal(agent.isActive, true);
  assert.equal(agent.tools.length, tools);

  const automations = await prisma.automation.count({ where: { organizationId: organization.id } });
  assert.ok(automations >= 2);

  const audit = await prisma.auditLog.findFirst({
    where: { organizationId: organization.id, action: "organization.registered" },
  });
  assert.ok(audit);
  assert.equal(audit.userId, user.id);
});

test("login issues a token scoped to the user's own organization", async () => {
  const acme = await createTenant("acme");
  const globex = await createTenant("globex");

  const session = await login({ email: acme.user.email, password: "supersecret" });
  const claims = verifyToken(session.token);

  assert.equal(claims.organizationId, acme.organization.id);
  assert.notEqual(claims.organizationId, globex.organization.id);
  assert.equal(session.organization.id, acme.organization.id);

  await assert.rejects(() => login({ email: acme.user.email, password: "nope" }), /incorrect/);
  await assert.rejects(() => login({ email: "missing@example.test", password: "supersecret" }), /incorrect/);
});

test("registration rejects duplicate emails and weak passwords", async () => {
  const first = await createTenant("dup");

  await assert.rejects(
    () =>
      registerOrganization({
        organizationName: "Second Org",
        name: "Second Owner",
        email: first.user.email,
        password: "supersecret",
      }),
    /already exists/,
  );

  await assert.rejects(
    () =>
      registerOrganization({
        organizationName: "Third Org",
        name: "Third Owner",
        email: `short-${suffix}@example.test`,
        password: "short",
      }),
    /at least 8 characters/,
  );
});
