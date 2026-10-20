import { randomUUID } from "node:crypto";
import { prisma } from "../../db/prisma.js";
import { recordAudit } from "../../lib/audit.js";
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "../../lib/errors.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { createToken } from "../../lib/tokens.js";
import { asString } from "../../lib/validate.js";
import { bootstrapOrganizationDefaults } from "../organizations/service.js";

/**
 * Authentication and team management.
 *
 * Registration creates the organization and its first OWNER in one step; the
 * issued token carries the organization id, which is the only tenant identity
 * the API ever trusts.
 */

const PUBLIC_USER = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
};

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function uniqueSlug(base) {
  const root = slugify(base) || "organization";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`;
    const existing = await prisma.organization.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
  }
  return `${root}-${randomUUID().slice(0, 6)}`;
}

function normalizeEmail(value) {
  const email = asString(value, "email", { required: true, max: 200 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError("email must be valid");
  return email.toLowerCase();
}

export async function registerOrganization({ organizationName, name, email, password, req = null }) {
  const orgName = asString(organizationName, "organizationName", { required: true, max: 120 });
  const userName = asString(name, "name", { required: true, max: 120 });
  const normalizedEmail = normalizeEmail(email);
  const passwordHash = await hashPassword(password ?? "");

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) throw new ConflictError("An account with that email already exists");

  const slug = await uniqueSlug(orgName);

  const organization = await prisma.organization.create({
    data: {
      name: orgName,
      slug,
      plan: "trial",
      users: {
        create: {
          email: normalizedEmail,
          name: userName,
          role: "OWNER",
          passwordHash,
        },
      },
    },
    include: { users: { select: PUBLIC_USER } },
  });

  const user = organization.users[0];
  await bootstrapOrganizationDefaults({ organizationId: organization.id });
  await recordAudit({
    organizationId: organization.id,
    userId: user.id,
    action: "organization.registered",
    entityType: "Organization",
    entityId: organization.id,
    req,
  });

  return {
    token: createToken({ userId: user.id, organizationId: organization.id, role: user.role }),
    user,
    organization: { id: organization.id, name: organization.name, slug: organization.slug, plan: organization.plan },
  };
}

export async function login({ email, password, req = null }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { organization: true },
  });

  const invalid = new UnauthorizedError("Email or password is incorrect");
  if (!user || !user.isActive || !user.passwordHash) throw invalid;
  if (!(await verifyPassword(password ?? "", user.passwordHash))) throw invalid;

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await recordAudit({
    organizationId: user.organizationId,
    userId: user.id,
    action: "auth.login",
    entityType: "User",
    entityId: user.id,
    req,
  });

  return {
    token: createToken({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
    }),
    user: { ...pickUser(user), lastLoginAt: new Date() },
    organization: {
      id: user.organization.id,
      name: user.organization.name,
      slug: user.organization.slug,
      plan: user.organization.plan,
    },
  };
}

function pickUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
  };
}

/** Resolve the authenticated user for a verified token. */
export async function getSession({ userId, organizationId }) {
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId },
    include: { organization: true },
  });

  if (!user || !user.isActive) throw new UnauthorizedError("Session is no longer valid");

  return {
    user: pickUser(user),
    organization: {
      id: user.organization.id,
      name: user.organization.name,
      slug: user.organization.slug,
      plan: user.organization.plan,
    },
  };
}

export async function changePassword({ userId, organizationId, currentPassword, newPassword }) {
  const user = await prisma.user.findFirst({ where: { id: userId, organizationId } });
  if (!user) throw new NotFoundError("User not found");

  if (!(await verifyPassword(currentPassword ?? "", user.passwordHash ?? ""))) {
    throw new UnauthorizedError("Current password is incorrect");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword ?? "") },
  });

  return { changed: true };
}

// ---------------------------------------------------------------------------
// Team members (Settings)
// ---------------------------------------------------------------------------

export function listTeam({ organizationId }) {
  return prisma.user.findMany({
    where: { organizationId },
    select: { ...PUBLIC_USER, _count: { select: { conversations: true } } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
}

export async function createTeamMember({ organizationId, name, email, password, role, req = null }) {
  const userName = asString(name, "name", { required: true, max: 120 });
  const normalizedEmail = normalizeEmail(email);
  const memberRole = asString(role, "role", { required: true, max: 20 });

  if (!["OWNER", "ADMIN", "AGENT", "VIEWER"].includes(memberRole)) {
    throw new ValidationError("role must be one of: OWNER, ADMIN, AGENT, VIEWER");
  }

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) throw new ConflictError("A user with that email already exists");

  const user = await prisma.user.create({
    data: {
      organizationId,
      email: normalizedEmail,
      name: userName,
      role: memberRole,
      passwordHash: await hashPassword(password ?? ""),
    },
    select: PUBLIC_USER,
  });

  await recordAudit({
    organizationId,
    action: "user.created",
    entityType: "User",
    entityId: user.id,
    metadata: { role: memberRole },
    req,
  });

  return user;
}

export async function updateTeamMember({ organizationId, userId, data, req = null }) {
  const user = await prisma.user.findFirst({ where: { id: userId, organizationId } });
  if (!user) throw new NotFoundError("Team member not found");

  const role = data.role ?? undefined;
  if (role && !["OWNER", "ADMIN", "AGENT", "VIEWER"].includes(role)) {
    throw new ValidationError("role must be one of: OWNER, ADMIN, AGENT, VIEWER");
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: data.name === undefined ? undefined : data.name,
      role,
      isActive: data.isActive === undefined ? undefined : data.isActive,
      ...(data.password ? { passwordHash: await hashPassword(data.password) } : {}),
    },
    select: PUBLIC_USER,
  });

  await recordAudit({
    organizationId,
    action: "user.updated",
    entityType: "User",
    entityId: user.id,
    metadata: { role, isActive: data.isActive },
    req,
  });

  return updated;
}
