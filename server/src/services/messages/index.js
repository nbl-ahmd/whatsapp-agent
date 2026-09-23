/**
 * Messages module.
 *
 * Persistence and retrieval of normalized messages (inbound/outbound) and the
 * single outbound messaging abstraction used by automation, AI and the inbox.
 */
export * from "./service.js";
export * from "./outbound.js";

export const descriptor = Object.freeze({
  name: "messages",
  phase: 3,
  description: "Normalized message persistence and the outbound messaging abstraction.",
});
