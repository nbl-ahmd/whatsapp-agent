/**
 * Conversations module.
 *
 * Conversation lifecycle and mode management (ai | human | paused). AI and
 * human agents must never respond simultaneously: human takeover disables AI
 * processing until explicitly re-enabled.
 */
export * from "./service.js";

export const descriptor = Object.freeze({
  name: "conversations",
  phase: 3,
  description: "Conversation lifecycle and ai/human/paused mode management.",
});
