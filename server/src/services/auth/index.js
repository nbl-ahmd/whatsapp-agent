/**
 * Auth module.
 *
 * Authentication and tenant resolution. Tenant identity is always derived from
 * authenticated context - never from a client-supplied organization id. Every
 * tenant-owned query must enforce isolation through this module.
 */
export const descriptor = Object.freeze({
  name: "auth",
  phase: 1,
  description: "Authentication, authorization and tenant resolution.",
});
