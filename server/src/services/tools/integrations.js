import { resolveAdapter } from "../integrations/index.js";

/**
 * CRM/ecommerce tools (phase 7).
 *
 * The model gets generic capability names, never a vendor name. Each execute
 * resolves the organization's active integration for that category, so swapping
 * HubSpot for another CRM does not change the prompt or the agent loop.
 */

export const integrationTools = [
  {
    name: "crm_find_customer",
    description:
      "Look up a customer in the connected CRM by email or phone. Returns null when no record exists.",
    permission: "read",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string" },
        phone: { type: "string" },
      },
      additionalProperties: false,
    },
    async execute({ args, context }) {
      const adapter = await resolveAdapter({
        organizationId: context.organizationId,
        category: "crm",
      });
      return adapter.findCustomer({ email: args.email, phone: args.phone });
    },
  },
  {
    name: "crm_create_lead",
    description:
      "Create or update a CRM lead for this customer and optionally attach a note. Use when the customer wants a callback, quote or follow-up.",
    permission: "write",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string" },
        name: { type: "string" },
        phone: { type: "string" },
        note: { type: "string" },
      },
      additionalProperties: false,
    },
    async execute({ args, context }) {
      const adapter = await resolveAdapter({
        organizationId: context.organizationId,
        category: "crm",
      });
      return adapter.createLead(args);
    },
  },
  {
    name: "ecommerce_search_products",
    description:
      "Search the connected store's products. Always use this for prices, availability and variants instead of guessing.",
    permission: "read",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer" },
      },
      additionalProperties: false,
    },
    async execute({ args, context }) {
      const adapter = await resolveAdapter({
        organizationId: context.organizationId,
        category: "ecommerce",
      });
      return adapter.searchProducts({ query: args.query, limit: args.limit });
    },
  },
  {
    name: "ecommerce_get_order",
    description:
      "Read one order from the connected store by id, including status, totals and line items.",
    permission: "read",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    async execute({ args, context }) {
      const adapter = await resolveAdapter({
        organizationId: context.organizationId,
        category: "ecommerce",
      });
      return adapter.getOrder({ id: args.id });
    },
  },
  {
    name: "ecommerce_list_orders",
    description: "List recent orders from the connected store. Useful for 'where is my order' questions.",
    permission: "read",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        limit: { type: "integer" },
      },
      additionalProperties: false,
    },
    async execute({ args, context }) {
      const adapter = await resolveAdapter({
        organizationId: context.organizationId,
        category: "ecommerce",
      });
      return adapter.listOrders({ status: args.status, limit: args.limit });
    },
  },
];
