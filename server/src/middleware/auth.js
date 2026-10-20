import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import { bearerToken, verifyToken } from "../lib/tokens.js";
import { getSession } from "../services/auth/service.js";

/**
 * Session authentication.
 *
 * Tenant identity comes from the signed token only. Controllers read
 * `req.auth.organizationId`; a client-supplied organization id is never trusted.
 */

export async function requireAuth(req, _res, next) {
  try {
    const token = bearerToken(req.get("authorization"));
    if (!token) throw new UnauthorizedError("Sign in to continue");

    const claims = verifyToken(token);
    const session = await getSession({
      userId: claims.userId,
      organizationId: claims.organizationId,
    });

    req.auth = {
      userId: session.user.id,
      organizationId: session.organization.id,
      role: session.user.role,
      user: session.user,
      organization: session.organization,
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Attach `req.auth` when a valid session is present, but never reject.
 * Used by endpoints that accept either a signed-in operator or a guarded
 * server-to-server call.
 */
export async function optionalAuth(req, _res, next) {
  const token = bearerToken(req.get("authorization"));
  if (!token) return next();

  try {
    const claims = verifyToken(token);
    const session = await getSession({
      userId: claims.userId,
      organizationId: claims.organizationId,
    });
    req.auth = {
      userId: session.user.id,
      organizationId: session.organization.id,
      role: session.user.role,
      user: session.user,
      organization: session.organization,
    };
  } catch {
    // Ignore: the route may still be authorized by another scheme.
  }

  return next();
}

/** Restrict a route to specific organization roles. */export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.auth) return next(new UnauthorizedError("Sign in to continue"));
    if (!roles.includes(req.auth.role)) {
      return next(new ForbiddenError(`Requires role: ${roles.join(" or ")}`));
    }
    return next();
  };
}

export const ADMIN_ROLES = ["OWNER", "ADMIN"];
