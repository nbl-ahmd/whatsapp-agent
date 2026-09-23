/**
 * AI agent module.
 *
 * Provider-neutral agent loop (OpenAI-compatible) with tool calling. The model
 * has no direct database or API access: every action goes through a registered
 * tool with a schema and validation.
 */
export const descriptor = Object.freeze({
  name: "ai",
  phase: 5,
  description: "Provider-neutral tool-using AI agent.",
});
