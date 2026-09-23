import { ForbiddenError, UnauthorizedError } from "./errors.js";

/**
 * Multi-tenant isolation helpers.
 *
 * Tenant identity must always come from authenticated server-side context,
 * never from a client-supplied value. These helpers make it hard to forget the
 * `organizationId` filter on a query and enforce cross-tenant checks.
 */

export function assertOrganizationId(organizationId) {
  if (typeof organizationId !== "string" || organizationId.length === 0) {
    throw new UnauthorizedError("Missing tenant context");
  }
  return organizationId;
}

/** Build a Prisma `where` clause scoped to the tenant. */
export function tenantWhere(organizationId, where = {}) {
  return { ...where, organizationId: assertOrganizationId(organizationId) };
}

/** Build Prisma `data` scoped to the tenant (for creates). */
export function tenantData(organizationId, data = {}) {
  return { ...data, organizationId: assertOrganizationId(organizationId) };
}

/** Assert that a fetched record belongs to the current tenant. */
export function assertSameTenant(organizationId, resource) {
  assertOrganizationId(organizationId);
  if (!resource || resource.organizationId !== organizationId) {
    throw new ForbiddenError("Cross-tenant access denied");
  }
  return resource;
}
