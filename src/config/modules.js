/**
 * Core module roadmap shown on the dashboard. The actual implementations live
 * in the backend (`server/src/services/*`); this is display metadata only.
 */
export const modules = Object.freeze([
  { name: "whatsapp", phase: 2, description: "Meta WhatsApp Cloud API integration and outbound messaging." },
  { name: "webhooks", phase: 2, description: "Inbound webhook verification, persistence and normalization." },
  { name: "contacts", phase: 3, description: "Organization-scoped contacts and tags." },
  { name: "conversations", phase: 3, description: "Conversation lifecycle and ai/human/paused modes." },
  { name: "messages", phase: 3, description: "Normalized message persistence and outbound abstraction." },
  { name: "automation", phase: 4, description: "Event-driven JSON workflow engine." },
  { name: "ai", phase: 5, description: "Provider-neutral tool-using AI agent." },
  { name: "tools", phase: 5, description: "Tool registry with schemas and permissions." },
  { name: "integrations", phase: 7, description: "CRM, ecommerce and MCP adapter interfaces." },
  { name: "workers", phase: 4, description: "Background queue consumers." },
  { name: "analytics", phase: 9, description: "Organization-scoped metrics and reporting." },
  { name: "auth", phase: 1, description: "Authentication, authorization and tenant resolution." },
]);
