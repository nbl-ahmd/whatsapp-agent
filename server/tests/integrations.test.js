import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { prisma } from "../src/db/prisma.js";
import {
  createIntegration,
  listActiveCategories,
  listIntegrations,
  resolveAdapter,
  testIntegration,
  updateIntegration,
} from "../src/services/integrations/index.js";
import { executeTool } from "../src/services/tools/registry.js";

process.env.ENCRYPTION_KEY ??= "test-encryption-key";

const suffix = Math.random().toString(36).slice(2, 8);
const createdOrganizations = [];
const seenAuth = [];

after(async () => {
  for (const organizationId of createdOrganizations) {
    await prisma.organization.delete({ where: { id: organizationId } }).catch(() => null);
  }
  await prisma.$disconnect();
});

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(payload));
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : null;
}

function mockProvider() {
  return createServer(async (req, res) => {
    const url = new URL(req.url, "http://mock.local");
    const path = decodeURIComponent(url.pathname);
    if (req.headers.authorization) seenAuth.push(req.headers.authorization);
    if (req.headers["x-shopify-access-token"]) {
      seenAuth.push(req.headers["x-shopify-access-token"]);
    }

    // HubSpot
    if (path === "/crm/v3/objects/contacts" && req.method === "GET") {
      return json(res, 200, { results: [] });
    }
    if (path === "/crm/v3/objects/contacts" && req.method === "POST") {
      const body = await readBody(req);
      return json(res, 201, { id: "c-new", properties: body.properties });
    }
    if (path === "/crm/v3/objects/contacts/search" && req.method === "POST") {
      return json(res, 200, {
        results: [
          {
            id: "c-phone",
            properties: { email: "phone@example.com", firstname: "Phone", lastname: "Owner", phone: "+1555" },
          },
        ],
      });
    }
    if (path.startsWith("/crm/v3/objects/contacts/") && req.method === "GET") {
      if (path.includes("missing")) return json(res, 404, { message: "not found" });
      return json(res, 200, {
        id: "c-1",
        properties: { email: "jane@example.com", firstname: "Jane", lastname: "Doe", phone: "+15550100" },
      });
    }
    if (path.startsWith("/crm/v3/objects/contacts/") && req.method === "PATCH") {
      const body = await readBody(req);
      return json(res, 200, { id: "c-1", properties: body.properties });
    }
    if (path === "/crm/v3/objects/notes" && req.method === "POST") {
      return json(res, 201, { id: "note-1" });
    }

    // Shopify
    if (path === "/shop.json") return json(res, 200, { shop: { name: "Test Shop" } });
    if (path === "/products.json") {
      return json(res, 200, {
        products: [
          {
            id: 1,
            title: "Red Shoe",
            status: "active",
            vendor: "Acme",
            product_type: "Shoes",
            tags: "red,sale",
            variants: [{ id: 11, title: "42", price: "49.00", sku: "RS-42", inventory_quantity: 3 }],
          },
          {
            id: 2,
            title: "Blue Hat",
            status: "active",
            vendor: "Acme",
            product_type: "Hats",
            variants: [{ id: 22, title: "M", price: "19.00", sku: "BH-M", inventory_quantity: 0 }],
          },
        ],
      });
    }
    if (path === "/products/1.json") {
      return json(res, 200, {
        product: {
          id: 1,
          title: "Red Shoe",
          status: "active",
          variants: [{ id: 11, title: "42", price: "49.00", sku: "RS-42" }],
        },
      });
    }
    if (path === "/orders/2.json") {
      return json(res, 200, {
        order: {
          id: 2,
          name: "#1002",
          email: "jane@example.com",
          financial_status: "paid",
          fulfillment_status: null,
          total_price: "49.00",
          currency: "USD",
          line_items: [{ title: "Red Shoe", quantity: 1, price: "49.00", sku: "RS-42" }],
        },
      });
    }
    if (path === "/orders/2/cancel.json" && req.method === "POST") {
      return json(res, 200, {
        order: { id: 2, name: "#1002", cancelled_at: "2026-10-22T00:00:00Z", total_price: "49.00" },
      });
    }
    if (path === "/orders.json" && req.method === "GET") {
      return json(res, 200, { orders: [{ id: 2, name: "#1002", total_price: "49.00" }] });
    }
    if (path === "/orders.json" && req.method === "POST") {
      const body = await readBody(req);
      return json(res, 201, { order: { id: 3, name: "#1003", line_items: body.order.line_items } });
    }

    return json(res, 404, { message: `unhandled ${req.method} ${path}` });
  });
}

async function createOrganization(label) {
  const organization = await prisma.organization.create({
    data: { name: `Integration ${label}`, slug: `integration-${label}-${suffix}` },
  });
  createdOrganizations.push(organization.id);
  return organization;
}

test("CRM and ecommerce adapters call providers with tenant credentials", async (t) => {
  const server = mockProvider();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const organization = await createOrganization("primary");

  const crm = await createIntegration({
    organizationId: organization.id,
    category: "crm",
    provider: "hubspot",
    input: { accessToken: "hs-secret", baseUrl },
  });
  const ecommerce = await createIntegration({
    organizationId: organization.id,
    category: "ecommerce",
    provider: "shopify",
    input: {
      shopDomain: "test.myshopify.com",
      accessToken: "sh-secret",
      baseUrl,
      apiVersion: "2024-10",
    },
  });

  assert.equal(crm.status, "active");
  assert.equal(ecommerce.status, "active");

  const updated = await updateIntegration({
    organizationId: organization.id,
    integrationId: crm.id,
    name: "Support CRM",
    isActive: true,
  });
  assert.equal(updated.name, "Support CRM");
  assert.equal(updated.isActive, true);

  const activeCategories = await listActiveCategories({ organizationId: organization.id });
  assert.deepEqual([...activeCategories].sort(), ["crm", "ecommerce"]);

  const listed = await listIntegrations({ organizationId: organization.id });
  assert.equal(listed.length, 2);
  assert.equal(JSON.stringify(listed).includes("hs-secret"), false);
  assert.equal(JSON.stringify(listed).includes("sh-secret"), false);
  assert.equal(listed.find((row) => row.category === "crm").providerLabel, "HubSpot CRM");

  const crmAdapter = await resolveAdapter({ organizationId: organization.id, category: "crm" });
  const jane = await crmAdapter.findCustomer({ email: "jane@example.com" });
  assert.equal(jane.id, "c-1");
  assert.equal(jane.name, "Jane Doe");
  assert.equal(jane.phone, "+15550100");

  const byPhone = await crmAdapter.findCustomer({ phone: "+1555" });
  assert.equal(byPhone.id, "c-phone");

  assert.equal(await crmAdapter.findCustomer({ email: "missing@example.com" }), null);

  const lead = await crmAdapter.createLead({
    email: "jane@example.com",
    name: "Jane Doe",
    phone: "+15550100",
    note: "Wants a quote",
  });
  assert.equal(lead.customer.id, "c-1");
  assert.equal(lead.note.id, "note-1");

  const shop = await resolveAdapter({ organizationId: organization.id, category: "ecommerce" });
  const products = await shop.searchProducts({ query: "shoe" });
  assert.equal(products.length, 1);
  assert.equal(products[0].title, "Red Shoe");
  assert.equal(products[0].variants[0].sku, "RS-42");

  const order = await shop.getOrder({ id: "2" });
  assert.equal(order.name, "#1002");
  assert.equal(order.total, "49.00");

  const cancelled = await shop.cancelOrder({ id: "2", reason: "customer" });
  assert.equal(cancelled.id, 2);
  assert.ok(cancelled.cancelledAt);

  assert.ok(seenAuth.includes("Bearer hs-secret"));
  assert.ok(seenAuth.includes("sh-secret"));

  // Provider connection tests use a cheap read call.
  const tested = await testIntegration({
    organizationId: organization.id,
    integrationId: crm.id,
  });
  assert.equal(tested.ok, true);
});

test("integration tools fail clearly when no provider is connected", async () => {
  const organization = await createOrganization("empty");

  await assert.rejects(
    () =>
      executeTool({
        name: "crm_find_customer",
        args: { email: "jane@example.com" },
        context: { organizationId: organization.id },
        permissions: ["read"],
      }),
    /No active crm integration/,
  );

  await assert.rejects(
    () =>
      executeTool({
        name: "ecommerce_get_order",
        args: { id: "2" },
        context: { organizationId: organization.id },
        permissions: ["read"],
      }),
    /No active ecommerce integration/,
  );
});
