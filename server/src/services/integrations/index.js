/**
 * Integrations module.
 *
 * Provider adapters behind stable interfaces: CRM (findCustomer, createCustomer,
 * updateCustomer, addNote, createLead), ecommerce (searchProducts, getProduct,
 * getOrder, listOrders, createOrder, cancelOrder) and MCP.
 */
export const descriptor = Object.freeze({
  name: "integrations",
  phase: 7,
  description: "CRM, ecommerce and MCP adapter interfaces.",
});
