import { registerAdapter } from "../registry.js";
import { createHubSpotAdapter } from "./hubspot.js";
import { createShopifyAdapter } from "./shopify.js";

/** Built-in providers. Add a new file + registration here; nothing else changes. */

registerAdapter({
  category: "crm",
  provider: "hubspot",
  label: "HubSpot CRM",
  description: "Contacts, notes and leads in HubSpot via a private-app access token.",
  fields: [
    {
      name: "accessToken",
      label: "Private app access token",
      type: "password",
      required: true,
      secret: true,
      hint: "HubSpot → Settings → Integrations → Private apps. Needs contacts read/write.",
    },
    {
      name: "baseUrl",
      label: "API base URL (optional)",
      type: "url",
      required: false,
      secret: false,
      hint: "Leave blank for https://api.hubapi.com. Useful for a staging proxy.",
    },
  ],
  create: createHubSpotAdapter,
});

registerAdapter({
  category: "ecommerce",
  provider: "shopify",
  label: "Shopify",
  description: "Products, orders and cancellations from a Shopify store.",
  fields: [
    {
      name: "shopDomain",
      label: "Shop domain",
      type: "text",
      required: true,
      secret: false,
      placeholder: "my-store.myshopify.com",
    },
    {
      name: "accessToken",
      label: "Admin API access token",
      type: "password",
      required: true,
      secret: true,
      hint: "Custom app token with read_products and read_orders (write_orders for create/cancel).",
    },
    {
      name: "apiVersion",
      label: "API version (optional)",
      type: "text",
      required: false,
      secret: false,
      placeholder: "2024-10",
    },
    {
      name: "baseUrl",
      label: "API base URL (optional)",
      type: "url",
      required: false,
      secret: false,
      hint: "Leave blank for the Shopify Admin API. Useful for a staging proxy.",
    },
  ],
  create: createShopifyAdapter,
});
