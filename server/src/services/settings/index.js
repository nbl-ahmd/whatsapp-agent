import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { recordAudit } from "../../lib/audit.js";
import { decryptSecret, encryptSecret, isEncrypted } from "../../lib/crypto.js";
import { ValidationError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { asEnum, asString } from "../../lib/validate.js";

/**
 * Organization-level BYOK settings.
 *
 * Secrets are encrypted with the server ENCRYPTION_KEY and are never returned
 * to a client: the API only reports whether a value is stored and where the
 * effective value came from ("settings", "env" or "none"). Environment
 * variables remain the fallback, so local `.env` setups keep working.
 */

export const AI_PROVIDERS = Object.freeze(["mock", "openai"]);

const META_SECRET_FIELDS = ["metaAppSecret", "metaVerifyToken", "metaAccessToken"];

function safeDecrypt(value, field) {
  if (!value) return null;
  try {
    return decryptSecret(value);
  } catch (error) {
    // A wrong/rotated ENCRYPTION_KEY must not take the whole API down.
    logger.warn("Stored credential could not be decrypted", { field, error: error.message });
    return null;
  }
}

function source(stored, fallback) {
  if (stored) return "settings";
  return fallback ? "env" : "none";
}

function buildMetaConfig(row) {
  const storedSecret = row?.metaAppSecret ? safeDecrypt(row.metaAppSecret, "metaAppSecret") : null;
  const storedVerify = row?.metaVerifyToken
    ? safeDecrypt(row.metaVerifyToken, "metaVerifyToken")
    : null;
  const storedToken = row?.metaAccessToken
    ? safeDecrypt(row.metaAccessToken, "metaAccessToken")
    : null;

  return {
    appSecret: storedSecret || env.meta.appSecret || null,
    verifyToken: storedVerify || env.meta.verifyToken || null,
    accessToken: storedToken || env.meta.accessToken || null,
    graphApiVersion: row?.metaGraphApiVersion || env.meta.graphApiVersion,
    graphApiBaseUrl: row?.metaGraphApiBaseUrl || env.meta.graphApiBaseUrl,
    source: {
      appSecret: source(storedSecret, env.meta.appSecret),
      verifyToken: source(storedVerify, env.meta.verifyToken),
      accessToken: source(storedToken, env.meta.accessToken),
      graphApiVersion: row?.metaGraphApiVersion ? "settings" : "env",
      graphApiBaseUrl: row?.metaGraphApiBaseUrl ? "settings" : "env",
    },
    stored: {
      appSecret: Boolean(row?.metaAppSecret),
      verifyToken: Boolean(row?.metaVerifyToken),
      accessToken: Boolean(row?.metaAccessToken),
    },
  };
}

function buildAiConfig(row) {
  const storedKey = row?.aiApiKey ? safeDecrypt(row.aiApiKey, "aiApiKey") : null;
  const apiKey = storedKey || env.ai.apiKey || null;
  const provider = row?.aiProvider || env.ai.provider || (apiKey ? "openai" : "mock");

  return {
    provider,
    apiKey,
    baseUrl: row?.aiBaseUrl || env.ai.baseUrl,
    model: row?.aiModel || env.ai.model,
    source: {
      provider: row?.aiProvider ? "settings" : "env",
      apiKey: source(storedKey, env.ai.apiKey),
      baseUrl: row?.aiBaseUrl ? "settings" : "env",
      model: row?.aiModel ? "settings" : "env",
    },
    stored: {
      provider: Boolean(row?.aiProvider),
      apiKey: Boolean(row?.aiApiKey),
      baseUrl: Boolean(row?.aiBaseUrl),
      model: Boolean(row?.aiModel),
    },
  };
}

async function getRow(organizationId) {
  return prisma.organizationSettings.findUnique({ where: { organizationId } });
}

/** Effective Meta configuration (settings first, env fallback). */
export async function getMetaConfig({ organizationId }) {
  return buildMetaConfig(await getRow(organizationId));
}

/** Effective AI configuration (settings first, env fallback). */
export async function getAiConfig({ organizationId }) {
  return buildAiConfig(await getRow(organizationId));
}

/** Safe representation for the Settings page: flags and non-secrets only. */
export async function getCredentialSettings({ organizationId }) {
  const row = await getRow(organizationId);
  const meta = buildMetaConfig(row);
  const ai = buildAiConfig(row);

  return {
    meta: {
      appSecretConfigured: Boolean(meta.appSecret),
      verifyTokenConfigured: Boolean(meta.verifyToken),
      accessTokenConfigured: Boolean(meta.accessToken),
      graphApiVersion: meta.graphApiVersion,
      graphApiBaseUrl: meta.graphApiBaseUrl,
      stored: meta.stored,
      source: meta.source,
    },
    ai: {
      provider: ai.provider,
      apiKeyConfigured: Boolean(ai.apiKey),
      baseUrl: ai.baseUrl,
      model: ai.model,
      stored: ai.stored,
      source: ai.source,
    },
    server: {
      encryptionKeyConfigured: Boolean(env.encryptionKey),
      envFallbackInUse: Boolean(env.meta.accessToken || env.meta.verifyToken || env.meta.appSecret || env.ai.apiKey),
    },
  };
}

function secretValue(value, field, { required = false } = {}) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  const text = asString(value, field, { required, max: 4096 });
  if (!text) return null;
  // Never double-encrypt a value that already carries the ciphertext prefix.
  return isEncrypted(text) ? text : encryptSecret(text);
}

function plainValue(value, field, { max = 300 } = {}) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return asString(value, field, { max });
}

function httpUrl(value, field) {
  const text = plainValue(value, field, { max: 300 });
  if (!text) return text;
  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("protocol");
  } catch {
    throw new ValidationError(`${field} must be an http(s) URL`);
  }
  return text.replace(/\/+$/, "");
}

/**
 * Update BYOK settings. Secrets are tri-state: omitted keeps the stored value,
 * an empty string clears it (falling back to env), any value replaces it.
 */
export async function updateCredentialSettings({ organizationId, data = {}, req = null }) {
  const meta = data?.meta ?? {};
  const ai = data?.ai ?? {};

  const values = {
    metaAppSecret: secretValue(meta.appSecret, "meta.appSecret"),
    metaVerifyToken: secretValue(meta.verifyToken, "meta.verifyToken"),
    metaAccessToken: secretValue(meta.accessToken, "meta.accessToken"),
    metaGraphApiVersion: plainValue(meta.graphApiVersion, "meta.graphApiVersion", { max: 20 }),
    metaGraphApiBaseUrl: httpUrl(meta.graphApiBaseUrl, "meta.graphApiBaseUrl"),

    aiProvider:
      ai.provider === undefined
        ? undefined
        : asEnum(ai.provider, "ai.provider", AI_PROVIDERS, { fallback: null }),
    aiApiKey: secretValue(ai.apiKey, "ai.apiKey"),
    aiBaseUrl: httpUrl(ai.baseUrl, "ai.baseUrl"),
    aiModel: plainValue(ai.model, "ai.model", { max: 120 }),
  };

  const update = Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  );

  if (Object.keys(update).length === 0) {
    throw new ValidationError("No settings to update");
  }

  const row = await prisma.organizationSettings.upsert({
    where: { organizationId },
    update,
    create: { organizationId, ...update },
  });

  await recordAudit({
    organizationId,
    action: "organization.credentials_updated",
    entityType: "OrganizationSettings",
    entityId: row.organizationId,
    metadata: {
      fields: Object.keys(update),
      cleared: Object.entries(update)
        .filter(([, value]) => value === null)
        .map(([key]) => key),
    },
    req,
  });

  return getCredentialSettings({ organizationId });
}

/**
 * Every verify token the webhook handshake should accept: env, organization
 * settings and account-level tokens pasted on the WhatsApp page.
 */
export async function listWebhookVerifyTokens() {
  const tokens = new Set();
  if (env.meta.verifyToken) tokens.add(env.meta.verifyToken);

  const [settingsRows, accountRows] = await Promise.all([
    prisma.organizationSettings.findMany({
      where: { metaVerifyToken: { not: null } },
      select: { metaVerifyToken: true },
    }),
    prisma.whatsAppAccount.findMany({
      where: { webhookVerifyToken: { not: null } },
      select: { webhookVerifyToken: true },
    }),
  ]);

  for (const row of settingsRows) {
    const value = safeDecrypt(row.metaVerifyToken, "metaVerifyToken");
    if (value) tokens.add(value);
  }
  for (const row of accountRows) {
    const value = safeDecrypt(row.webhookVerifyToken, "webhookVerifyToken");
    if (value) tokens.add(value);
  }

  return [...tokens];
}

/**
 * App secrets that could have signed an inbound payload. When the payload names
 * phone number ids we only load those tenants; otherwise we fall back to every
 * organization secret. The signature still has to match one of them before the
 * payload is trusted.
 */
export async function listWebhookAppSecrets({ phoneNumberIds = [] } = {}) {
  const secrets = new Set();
  if (env.meta.appSecret) secrets.add(env.meta.appSecret);

  const ids = [...new Set(phoneNumberIds.filter(Boolean))];
  const numbers = ids.length
    ? await prisma.whatsAppPhoneNumber.findMany({
        where: { phoneNumberId: { in: ids } },
        select: {
          organizationId: true,
          whatsappAccount: { select: { appSecret: true } },
        },
      })
    : [];

  for (const number of numbers) {
    const value = number.whatsappAccount?.appSecret
      ? safeDecrypt(number.whatsappAccount.appSecret, "appSecret")
      : null;
    if (value) secrets.add(value);
  }

  const organizationIds = [...new Set(numbers.map((row) => row.organizationId))];
  const settingsRows = await prisma.organizationSettings.findMany({
    where: {
      ...(organizationIds.length ? { organizationId: { in: organizationIds } } : {}),
      metaAppSecret: { not: null },
    },
    select: { metaAppSecret: true },
  });

  for (const row of settingsRows) {
    const value = safeDecrypt(row.metaAppSecret, "metaAppSecret");
    if (value) secrets.add(value);
  }

  return [...secrets];
}

export function metaSecretFields() {
  return [...META_SECRET_FIELDS];
}
