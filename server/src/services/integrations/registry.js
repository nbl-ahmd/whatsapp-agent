import { ValidationError } from "../../lib/errors.js";

/**
 * Adapter registry for CRM, ecommerce and (later) MCP providers.
 *
 * A provider registers a factory plus the fields the connection form should
 * collect. Factories receive the decrypted credentials and non-secret config for
 * one organization, so no adapter ever sees another tenant's connection.
 */

export const ADAPTER_CONTRACT = Object.freeze({
  crm: ["findCustomer", "createCustomer", "updateCustomer", "addNote", "createLead"],
  ecommerce: ["searchProducts", "getProduct", "getOrder", "listOrders", "createOrder", "cancelOrder"],
  mcp: ["listTools", "callTool"],
});

const adapters = new Map();

function key(category, provider) {
  return `${category}:${provider}`;
}

export function registerAdapter({ category, provider, label, description, fields = [], create }) {
  if (!ADAPTER_CONTRACT[category]) {
    throw new ValidationError(`Unknown integration category: ${category}`);
  }
  if (!provider || typeof create !== "function") {
    throw new ValidationError("An adapter needs a provider name and a create function");
  }

  const entry = { category, provider, label: label ?? provider, description: description ?? "", fields };
  adapters.set(key(category, provider), { ...entry, create });
  return entry;
}

export function getAdapterFactory(category, provider) {
  const entry = adapters.get(key(category, provider));
  if (!entry) {
    throw new ValidationError(`No ${category} adapter is registered for "${provider}"`);
  }
  return entry;
}

export function getAdapter(category, provider, connection) {
  return getAdapterFactory(category, provider).create(connection);
}

/** Catalog for the Integrations page. Never includes factory functions. */
export function listProviders() {
  return [...adapters.values()].map(({ category, provider, label, description, fields }) => ({
    category,
    provider,
    label,
    description,
    fields,
    contract: ADAPTER_CONTRACT[category] ?? [],
  }));
}

export function listRegisteredAdapters() {
  return [...adapters.keys()];
}
