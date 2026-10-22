import { prisma } from "../../db/prisma.js";
import { recordAudit } from "../../lib/audit.js";
import { decryptSecret, encryptSecret } from "../../lib/crypto.js";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import "./adapters/index.js";
import {
  ADAPTER_CONTRACT,
  getAdapter,
  getAdapterFactory,
  listProviders,
  listRegisteredAdapters,
} from "./registry.js";

/**
 * Integration layer (phase 7).
 *
 * Provider adapters live in ./adapters and register themselves in ./registry.
 * Connection records hold non-secret config plus an AES-GCM encrypted credential
 * blob; neither is ever returned to the browser in plaintext.
 */

export { ADAPTER_CONTRACT, listProviders, listRegisteredAdapters };

function safeDecryptCredentials(row) {
  if (!row.credentials) return {};
  try {
    return JSON.parse(decryptSecret(row.credentials));
  } catch (error) {
    logger.warn("Stored integration credentials could not be decrypted", {
      integrationId: row.id,
      error: error?.message,
    });
    return {};
  }
}

function validateRequired(fields, config, credentials) {
  const missing = fields
    .filter((field) => field.required)
    .filter((field) => {
      const value = field.secret ? credentials[field.name] : config[field.name];
      return value === undefined || value === null || String(value).trim() === "";
    })
    .map((field) => field.name);

  if (missing.length > 0) {
    throw new ValidationError(`Missing integration fields: ${missing.join(", ")}`);
  }
}

function splitFields(fields, input = {}) {
  const config = {};
  const credentials = {};

  for (const field of fields) {
    const value = input[field.name];
    if (value === undefined) continue;
    if (typeof value !== "string") {
      throw new ValidationError(`${field.name} must be a string`);
    }
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (field.secret) credentials[field.name] = trimmed;
    else config[field.name] = trimmed;
  }

  return { config, credentials };
}

function publicRow(row) {
  const factory = getAdapterFactory(row.category, row.provider);
  return {
    id: row.id,
    provider: row.provider,
    providerLabel: factory.label,
    name: row.name,
    category: row.category,
    status: row.status,
    isActive: row.isActive,
    hasCredentials: Boolean(row.credentials),
    config: row.config ?? null,
    contract: ADAPTER_CONTRACT[row.category] ?? [],
    updatedAt: row.updatedAt,
  };
}

/** Integration records for the current organization (credentials never leave the server). */
export async function listIntegrations({ organizationId }) {
  const rows = await prisma.integration.findMany({
    where: { organizationId },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return rows.map((row) => {
    try {
      return publicRow(row);
    } catch {
      // A row created before its adapter was removed should not break the page.
      return {
        id: row.id,
        provider: row.provider,
        providerLabel: row.provider,
        name: row.name,
        category: row.category,
        status: row.status,
        isActive: row.isActive,
        hasCredentials: Boolean(row.credentials),
        config: row.config ?? null,
        contract: ADAPTER_CONTRACT[row.category] ?? [],
        updatedAt: row.updatedAt,
      };
    }
  });
}

export async function createIntegration({
  organizationId,
  provider,
  category,
  name,
  input = {},
  req = null,
}) {
  const factory = getAdapterFactory(category, provider);
  const { config, credentials } = splitFields(factory.fields, input);
  validateRequired(factory.fields, config, credentials);

  const displayName = String(name || factory.label).trim().slice(0, 120);
  if (!displayName) throw new ValidationError("name is required");

  const existing = await prisma.integration.findFirst({
    where: { organizationId, provider, name: displayName },
  });
  if (existing) throw new ConflictError("An integration with that name already exists");

  const row = await prisma.integration.create({
    data: {
      organizationId,
      provider,
      name: displayName,
      category,
      status: "active",
      isActive: true,
      config,
      credentials: Object.keys(credentials).length
        ? encryptSecret(JSON.stringify(credentials))
        : null,
    },
  });

  await recordAudit({
    organizationId,
    action: "integration.created",
    entityType: "Integration",
    entityId: row.id,
    metadata: { provider, category, name: displayName },
    req,
  });

  return publicRow(row);
}

export async function updateIntegration({
  organizationId,
  integrationId,
  input = {},
  name,
  isActive,
  req = null,
}) {
  const row = await prisma.integration.findFirst({
    where: { id: integrationId, organizationId },
  });
  if (!row) throw new NotFoundError("Integration not found");

  const factory = getAdapterFactory(row.category, row.provider);
  const { config, credentials } = splitFields(factory.fields, input);
  const mergedConfig = { ...(row.config ?? {}), ...config };
  const mergedCredentials = { ...safeDecryptCredentials(row), ...credentials };
  validateRequired(factory.fields, mergedConfig, mergedCredentials);

  const updated = await prisma.integration.update({
    where: { id: row.id },
    data: {
      ...(name ? { name: String(name).trim().slice(0, 120) } : {}),
      ...(typeof isActive === "boolean" ? { isActive } : {}),
      ...(Object.keys(config).length ? { config: mergedConfig } : {}),
      ...(Object.keys(credentials).length
        ? { credentials: encryptSecret(JSON.stringify(mergedCredentials)) }
        : {}),
    },
  });

  await recordAudit({
    organizationId,
    action: "integration.updated",
    entityType: "Integration",
    entityId: row.id,
    metadata: {
      fields: [...Object.keys(config), ...Object.keys(credentials)],
      ...(typeof isActive === "boolean" ? { isActive } : {}),
    },
    req,
  });

  return publicRow(updated);
}

export async function deleteIntegration({ organizationId, integrationId, req = null }) {
  const row = await prisma.integration.findFirst({
    where: { id: integrationId, organizationId },
  });
  if (!row) throw new NotFoundError("Integration not found");

  await prisma.integration.delete({ where: { id: row.id } });

  await recordAudit({
    organizationId,
    action: "integration.deleted",
    entityType: "Integration",
    entityId: row.id,
    metadata: { provider: row.provider, category: row.category },
    req,
  });

  return { id: row.id };
}

/** Categories with at least one active connection (used to hide tools the org cannot use). */
export async function listActiveCategories({ organizationId }) {
  const rows = await prisma.integration.findMany({
    where: { organizationId, isActive: true, status: "active" },
    select: { category: true },
    distinct: ["category"],
  });
  return new Set(rows.map((row) => row.category));
}

/** Decrypt a connection and hand it to the provider factory. */
export async function resolveAdapter({ organizationId, category }) {
  const row = await prisma.integration.findFirst({
    where: { organizationId, category, isActive: true, status: "active" },
    orderBy: { updatedAt: "desc" },
  });

  if (!row) {
    throw new ValidationError(
      `No active ${category} integration is connected. Add one on the Integrations page.`,
    );
  }

  return getAdapter(row.category, row.provider, {
    credentials: safeDecryptCredentials(row),
    config: row.config ?? {},
  });
}

export async function testIntegration({ organizationId, integrationId, req = null }) {
  const row = await prisma.integration.findFirst({
    where: { id: integrationId, organizationId },
  });
  if (!row) throw new NotFoundError("Integration not found");

  const adapter = getAdapter(row.category, row.provider, {
    credentials: safeDecryptCredentials(row),
    config: row.config ?? {},
  });

  try {
    if (typeof adapter.ping !== "function") {
      throw new ValidationError("This provider does not support a connection test");
    }
    const result = await adapter.ping();

    await prisma.integration.update({
      where: { id: row.id },
      data: { status: "active", isActive: true },
    });

    await recordAudit({
      organizationId,
      action: "integration.tested",
      entityType: "Integration",
      entityId: row.id,
      metadata: { ok: true, provider: row.provider },
      req,
    });

    return { ok: true, provider: row.provider, detail: result };
  } catch (error) {
    await prisma.integration
      .update({ where: { id: row.id }, data: { status: "error" } })
      .catch(() => null);

    await recordAudit({
      organizationId,
      action: "integration.tested",
      entityType: "Integration",
      entityId: row.id,
      metadata: { ok: false, provider: row.provider, error: error?.message },
      req,
    }).catch(() => null);

    throw error;
  }
}
