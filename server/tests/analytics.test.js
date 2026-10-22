import test, { after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/db/prisma.js";
import { getActivity, getDashboard } from "../src/services/analytics/index.js";

process.env.ENCRYPTION_KEY ??= "test-encryption-key";

const suffix = Math.random().toString(36).slice(2, 8);
const createdOrganizations = [];

after(async () => {
  for (const organizationId of createdOrganizations) {
    await prisma.organization.delete({ where: { id: organizationId } }).catch(() => null);
  }
  await prisma.$disconnect();
});

function dayKey(value) {
  return value.toISOString().slice(0, 10);
}

async function createTenant(label) {
  const organization = await prisma.organization.create({
    data: { name: `Analytics ${label}`, slug: `analytics-${label}-${suffix}` },
  });
  createdOrganizations.push(organization.id);

  const account = await prisma.whatsAppAccount.create({
    data: {
      organizationId: organization.id,
      name: `Analytics account ${label}`,
      wabaId: `WABA_ANALYTICS_${label}_${suffix}`,
      status: "ACTIVE",
    },
  });

  const number = await prisma.whatsAppPhoneNumber.create({
    data: {
      organizationId: organization.id,
      whatsappAccountId: account.id,
      phoneNumberId: `analytics-number-${label}-${suffix}`,
      displayPhoneNumber: "+15550188",
      status: "CONNECTED",
    },
  });

  const contact = await prisma.contact.create({
    data: { organizationId: organization.id, waId: `15550188${label}`, phone: "+15550188" },
  });

  const conversation = await prisma.conversation.create({
    data: {
      organizationId: organization.id,
      contactId: contact.id,
      phoneNumberId: number.id,
    },
  });

  return { organization, number, contact, conversation };
}

async function addMessage(tenant, direction, timestamp) {
  return prisma.message.create({
    data: {
      organizationId: tenant.organization.id,
      conversationId: tenant.conversation.id,
      contactId: tenant.contact.id,
      phoneNumberId: tenant.number.id,
      direction,
      type: "text",
      text: "analytics fixture",
      timestamp,
    },
  });
}

test("activity buckets are UTC days, tenant-scoped, and include empty days", async () => {
  const tenant = await createTenant("primary");
  const other = await createTenant("other");

  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 86_400_000);
  const tenDaysAgo = new Date(now.getTime() - 10 * 86_400_000);

  await addMessage(tenant, "inbound", now);
  await addMessage(tenant, "inbound", new Date(now.getTime() - 60_000));
  await addMessage(tenant, "outbound", now);
  await addMessage(tenant, "inbound", twoDaysAgo);
  await addMessage(tenant, "inbound", tenDaysAgo);

  // Another tenant's traffic must never leak into these buckets.
  await addMessage(other, "inbound", now);

  const activity = await getActivity({ organizationId: tenant.organization.id, days: 7 });

  assert.equal(activity.days, 7);
  assert.equal(activity.timezone, "UTC");
  assert.equal(activity.buckets.length, 7);
  assert.equal(activity.buckets.at(-1).date, dayKey(now));

  const today = activity.buckets.find((bucket) => bucket.date === dayKey(now));
  assert.equal(today.inbound, 2);
  assert.equal(today.outbound, 1);

  const earlier = activity.buckets.find((bucket) => bucket.date === dayKey(twoDaysAgo));
  assert.equal(earlier.inbound, 1);
  assert.equal(earlier.outbound, 0);

  const total = activity.buckets.reduce((sum, bucket) => sum + bucket.inbound + bucket.outbound, 0);
  assert.equal(total, 4, "the ten-day-old message stays outside the window");

  const emptyDay = activity.buckets.find(
    (bucket) => bucket.date !== dayKey(now) && bucket.date !== dayKey(twoDaysAgo),
  );
  assert.deepEqual(
    { inbound: emptyDay.inbound, outbound: emptyDay.outbound, conversations: emptyDay.conversations },
    { inbound: 0, outbound: 0, conversations: 0 },
  );

  // The dashboard response used by the UI carries the same buckets.
  const dashboard = await getDashboard({ organizationId: tenant.organization.id });
  assert.equal(dashboard.activity.buckets.length, 7);
  assert.equal(dashboard.activity.buckets.at(-1).inbound, 2);
});

test("activity clamps the requested window", async () => {
  const tenant = await createTenant("clamp");

  const tooSmall = await getActivity({ organizationId: tenant.organization.id, days: 0 });
  assert.equal(tooSmall.days, 7);

  const tooLarge = await getActivity({ organizationId: tenant.organization.id, days: 500 });
  assert.equal(tooLarge.days, 30);
  assert.equal(tooLarge.buckets.length, 30);
});
