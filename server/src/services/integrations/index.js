import { prisma } from "../../db/prisma.js";

/**
 * Integration layer.
 *
 * Phase 7 owns the real CRM/ecommerce/MCP adapters. What ships now is the
 * interface they will implement plus the organization's integration records, so
 * the UI can show what is connected and the AI tool layer has a stable seam.
 *
 * Adapter contract:
 *   crm:        findCustomer(), createCustomer(), updateCustomer(), addNote(), createLead()
 *   ecommerce:  searchProducts(), getProduct(), getOrder(), listOrders(), createOrder(), cancelOrder()
 *   mcp:        listTools(), callTool(name, args)
 */

export const descriptor = Object.freeze({
  name: "integrations",
  phase: 7,
  description: "CRM, ecommerce and MCP adapter interfaces.",
});

export const ADAPTER_CONTRACT = Object.freeze({
  crm: ["findCustomer", "createCustomer", "updateCustomer", "addNote", "createLead"],
  ecommerce: ["searchProducts", "getProduct", "getOrder", "listOrders", "createOrder", "cancelOrder"],
  mcp: ["listTools", "callTool"],
});

const adapters = new Map();

export function registerAdapter(category, provider, adapter) {
  adapters.set(`${category}:${provider}`, adapter);
  return adapter;
}

export function getAdapter(category, provider) {
  const adapter = adapters.get(`${category}:${provider}`);
  if (!adapter) {
    throw new Error(
      `No ${category} adapter registered for "${provider}". Integrations arrive in Phase 7.`,
    );
  }
  return adapter;
}

export function listRegisteredAdapters() {
  return [...adapters.keys()];
}

/** Integration records for the current organization (credentials never leave the server). */
export async function listIntegrations({ organizationId }) {
  const rows = await prisma.integration.findMany({
    where: { organizationId },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    name: row.name,
    category: row.category,
    status: row.status,
    isActive: row.isActive,
    hasCredentials: Boolean(row.credentials),
    config: row.config ?? null,
    contract: ADAPTER_CONTRACT[row.category] ?? [],
    updatedAt: row.updatedAt,
  }));
}
