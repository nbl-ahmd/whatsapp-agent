/**
 * Contacts module.
 *
 * Contact records scoped to an organization, plus tags used by automation
 * conditions and the AI tools.
 */
export * from "./service.js";

export const descriptor = Object.freeze({
  name: "contacts",
  phase: 3,
  description: "Organization-scoped contacts and tags.",
});
