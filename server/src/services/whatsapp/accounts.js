import { prisma } from "../../db/prisma.js";
import { recordAudit } from "../../lib/audit.js";
import { encryptSecret, isEncrypted } from "../../lib/crypto.js";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { asEnum, asString } from "../../lib/validate.js";
import {
  getPhoneNumber as getPhoneNumberFromMeta,
  getTemplates as getTemplatesFromMeta,
  getWaba,
  getWabaPhoneNumbers,
} from "./service.js";
import { resolveMetaAccountContext } from "./context.js";
import { PROVIDER_MODE } from "../messages/outbound.js";
import { resolveAccessTokenForAccount } from "./credentials.js";
import { getMetaConfig, updateCredentialSettings } from "../settings/index.js";

/**
 * WhatsApp connection management: accounts, phone numbers, credentials.
 *
 * Tokens are written through `encryptSecret` and are never returned to a
 * client; the API only reports whether a value is stored.
 */

const PROVIDER_MODES = Object.values(PROVIDER_MODE);

function credentialFlags(account) {
  return {
    hasAccessToken: Boolean(account?.accessToken),
    hasAppSecret: Boolean(account?.appSecret),
    hasVerifyToken: Boolean(account?.webhookVerifyToken),
  };
}

export function serializePhoneNumber(record) {
  return {
    id: record.id,
    phoneNumberId: record.phoneNumberId,
    displayPhoneNumber: record.displayPhoneNumber,
    verifiedName: record.verifiedName,
    qualityRating: record.qualityRating,
    status: record.status,
    providerMode: record.providerMode,
    account: record.whatsappAccount
      ? {
          id: record.whatsappAccount.id,
          name: record.whatsappAccount.name,
          wabaId: record.whatsappAccount.wabaId,
          status: record.whatsappAccount.status,
          ...credentialFlags(record.whatsappAccount),
        }
      : null,
  };
}

export function listPhoneNumbers({ organizationId }) {
  return prisma.whatsAppPhoneNumber
    .findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      include: { whatsappAccount: true },
    })
    .then((rows) => rows.map(serializePhoneNumber));
}

export async function listAccounts({ organizationId }) {
  const accounts = await prisma.whatsAppAccount.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    include: { phoneNumbers: true },
  });

  return accounts.map((account) => ({
    id: account.id,
    name: account.name,
    wabaId: account.wabaId,
    status: account.status,
    createdAt: account.createdAt,
    ...credentialFlags(account),
    phoneNumbers: account.phoneNumbers.map(serializePhoneNumber),
  }));
}

export async function createAccount({
  organizationId,
  name,
  wabaId = null,
  phoneNumberId,
  displayPhoneNumber,
  verifiedName = null,
  providerMode = PROVIDER_MODE.META,
  accessToken = null,
  appSecret = null,
  webhookVerifyToken = null,
  req = null,
}) {
  const accountName = asString(name, "name", { required: true, max: 120 });
  const metaPhoneNumberId = asString(phoneNumberId, "phoneNumberId", { required: true, max: 64 });
  const display = asString(displayPhoneNumber, "displayPhoneNumber", { required: true, max: 40 });
  const mode = asEnum(providerMode, "providerMode", PROVIDER_MODES, { fallback: PROVIDER_MODE.META });

  const existing = await prisma.whatsAppPhoneNumber.findUnique({
    where: { phoneNumberId: metaPhoneNumberId },
  });
  if (existing) throw new ConflictError("That WhatsApp phone number id is already connected");

  const normalizedWabaId = asString(wabaId, "wabaId", { max: 64 });
  const fallback = accessToken ? null : await getMetaConfig({ organizationId });
  const hasToken = Boolean(accessToken || fallback?.accessToken);

  const secretData = {
    accessToken: accessToken ? encryptSecret(accessToken) : undefined,
    appSecret: appSecret ? encryptSecret(appSecret) : undefined,
    webhookVerifyToken: webhookVerifyToken ? encryptSecret(webhookVerifyToken) : undefined,
  };

  // One WABA can own several numbers. Reuse its account instead of failing on
  // the (organizationId, wabaId) unique constraint when adding the second one.
  const existingAccount = normalizedWabaId
    ? await prisma.whatsAppAccount.findFirst({
        where: { organizationId, wabaId: normalizedWabaId },
      })
    : null;

  const account = existingAccount
    ? await prisma.whatsAppAccount.update({
        where: { id: existingAccount.id },
        data: {
          name: accountName,
          ...Object.fromEntries(
            Object.entries(secretData).filter(([, value]) => value !== undefined),
          ),
          status: hasToken || existingAccount.accessToken ? "ACTIVE" : existingAccount.status,
        },
      })
    : await prisma.whatsAppAccount.create({
        data: {
          organizationId,
          name: accountName,
          wabaId: normalizedWabaId,
          accessToken: secretData.accessToken ?? null,
          appSecret: secretData.appSecret ?? null,
          webhookVerifyToken: secretData.webhookVerifyToken ?? null,
          status: hasToken ? "ACTIVE" : "PENDING",
        },
      });

  const phoneNumber = await prisma.whatsAppPhoneNumber.create({
    data: {
      organizationId,
      whatsappAccountId: account.id,
      phoneNumberId: metaPhoneNumberId,
      displayPhoneNumber: display,
      verifiedName: asString(verifiedName, "verifiedName", { max: 120 }),
      providerMode: mode,
      status: mode === PROVIDER_MODE.SIMULATOR ? "CONNECTED" : "PENDING",
    },
    include: { whatsappAccount: true },
  });

  await recordAudit({
    organizationId,
    action: "whatsapp.account.created",
    entityType: "WhatsAppPhoneNumber",
    entityId: phoneNumber.id,
    metadata: { phoneNumberId: metaPhoneNumberId, providerMode: mode },
    req,
  });

  return serializePhoneNumber(phoneNumber);
}

const PHONE_STATUSES = ["PENDING", "CONNECTED", "FLAGGED", "DISCONNECTED"];

function normalizePhoneStatus(raw) {
  const value = String(raw ?? "").toUpperCase();
  return PHONE_STATUSES.includes(value) ? value : "CONNECTED";
}

function serializeDiscoveredNumber(row) {
  return {
    phoneNumberId: row?.id ?? null,
    displayPhoneNumber: row?.display_phone_number ?? null,
    verifiedName: row?.verified_name ?? null,
    qualityRating: row?.quality_rating ?? null,
    status: row?.status ?? null,
    platformType: row?.platform_type ?? null,
    codeVerificationStatus: row?.code_verification_status ?? null,
  };
}

function graphOptions(meta, accessToken) {
  return {
    accessToken,
    baseUrl: meta.graphApiBaseUrl,
    version: meta.graphApiVersion,
  };
}

/** Resolve the token the connect UI is allowed to use. Never returns it. */
async function resolveConnectionToken({ organizationId, accessToken }) {
  const supplied = asString(accessToken, "accessToken", { max: 4096 });
  const meta = await getMetaConfig({ organizationId });
  const token = supplied || meta.accessToken;
  if (!token) {
    throw new ValidationError(
      "No Meta access token. Paste one here or save it in Settings → API credentials.",
    );
  }
  return { token, supplied, meta };
}

/**
 * Ask Meta what numbers live under a WABA (or fetch one number by id) without
 * persisting anything. Powers the "Find my test number" step in Settings.
 */
export async function discoverMetaNumbers({
  organizationId,
  accessToken = null,
  wabaId = null,
  phoneNumberId = null,
}) {
  const { token, supplied, meta } = await resolveConnectionToken({
    organizationId,
    accessToken,
  });
  const options = graphOptions(meta, token);
  const waba = asString(wabaId, "wabaId", { max: 64 });
  const singleNumberId = asString(phoneNumberId, "phoneNumberId", { max: 64 });

  if (!waba && !singleNumberId) {
    throw new ValidationError("Enter a WABA id or a phone number id");
  }

  try {
    if (waba) {
      const [wabaInfo, numbers] = await Promise.all([
        getWaba(waba, options),
        getWabaPhoneNumbers(waba, options),
      ]);
      const connected = await prisma.whatsAppPhoneNumber.findMany({
        where: { organizationId },
        select: { phoneNumberId: true },
      });
      return {
        tokenSource: supplied ? "input" : meta.source.accessToken,
        waba: {
          id: wabaInfo?.id ?? waba,
          name: wabaInfo?.name ?? null,
          timezoneId: wabaInfo?.timezone_id ?? null,
          accountReviewStatus: wabaInfo?.account_review_status ?? null,
        },
        phoneNumbers: (numbers?.data ?? []).map(serializeDiscoveredNumber),
        connectedPhoneNumberIds: connected.map((row) => row.phoneNumberId),
      };
    }

    const number = await getPhoneNumberFromMeta(singleNumberId, options);
    return {
      tokenSource: supplied ? "input" : meta.source.accessToken,
      waba: null,
      phoneNumbers: [serializeDiscoveredNumber(number)],
      connectedPhoneNumberIds: [],
    };
  } catch (error) {
    throw new ValidationError(`Meta could not read that WhatsApp account: ${error.message}`);
  }
}

/**
 * Connect a number discovered from Meta. Unlike `createAccount`, this fetches
 * the canonical display name/number itself, so the operator only supplies ids.
 */
export async function connectMetaNumber({
  organizationId,
  accessToken = null,
  wabaId,
  phoneNumberId,
  req = null,
}) {
  const { token, supplied, meta } = await resolveConnectionToken({
    organizationId,
    accessToken,
  });
  const waba = asString(wabaId, "wabaId", { required: true, max: 64 });
  const metaPhoneNumberId = asString(phoneNumberId, "phoneNumberId", {
    required: true,
    max: 64,
  });
  const options = graphOptions(meta, token);

  let wabaInfo;
  let numberInfo;
  try {
    [wabaInfo, numberInfo] = await Promise.all([
      getWaba(waba, options),
      getPhoneNumberFromMeta(metaPhoneNumberId, options),
    ]);
  } catch (error) {
    throw new ValidationError(`Meta could not connect that number: ${error.message}`);
  }

  const display = asString(numberInfo?.display_phone_number, "displayPhoneNumber", {
    required: true,
    max: 40,
  });
  const verifiedName = asString(numberInfo?.verified_name, "verifiedName", { max: 120 });
  const accountName =
    asString(wabaInfo?.name, "name", { max: 120 }) ||
    verifiedName ||
    `WhatsApp ${display}`;

  const existingNumber = await prisma.whatsAppPhoneNumber.findUnique({
    where: { phoneNumberId: metaPhoneNumberId },
  });
  if (existingNumber && existingNumber.organizationId !== organizationId) {
    throw new ConflictError("That WhatsApp phone number id belongs to another organization");
  }

  const existingAccount = await prisma.whatsAppAccount.findFirst({
    where: { organizationId, wabaId: waba },
  });

  const account = existingAccount
    ? await prisma.whatsAppAccount.update({
        where: { id: existingAccount.id },
        data: { name: accountName, status: "ACTIVE" },
      })
    : await prisma.whatsAppAccount.create({
        data: {
          organizationId,
          name: accountName,
          wabaId: waba,
          status: supplied || meta.accessToken ? "ACTIVE" : "PENDING",
        },
      });

  const data = {
    organizationId,
    whatsappAccountId: account.id,
    displayPhoneNumber: display,
    verifiedName,
    qualityRating: numberInfo?.quality_rating ?? null,
    providerMode: PROVIDER_MODE.META,
    status: normalizePhoneStatus(numberInfo?.status),
  };

  const phoneNumber = existingNumber
    ? await prisma.whatsAppPhoneNumber.update({
        where: { id: existingNumber.id },
        data,
        include: { whatsappAccount: true },
      })
    : await prisma.whatsAppPhoneNumber.create({
        data: { ...data, phoneNumberId: metaPhoneNumberId },
        include: { whatsappAccount: true },
      });

  // Keep one credential for the organization: the token pasted while connecting
  // becomes the Settings token. Numbers fall back to it.
  if (supplied) {
    await updateCredentialSettings({
      organizationId,
      data: { meta: { accessToken: supplied } },
      req,
    });
  }

  await recordAudit({
    organizationId,
    action: existingNumber ? "whatsapp.account.reconnected" : "whatsapp.account.connected",
    entityType: "WhatsAppPhoneNumber",
    entityId: phoneNumber.id,
    metadata: { phoneNumberId: metaPhoneNumberId, wabaId: waba },
    req,
  });

  return serializePhoneNumber(phoneNumber);
}

/** Disconnect a number and remove its account once it has no numbers left. */
export async function removePhoneNumber({ organizationId, id, req = null }) {
  const record = await prisma.whatsAppPhoneNumber.findFirst({
    where: { id, organizationId },
  });
  if (!record) throw new NotFoundError("WhatsApp phone number not found");

  await prisma.whatsAppPhoneNumber.delete({ where: { id: record.id } });

  const remaining = await prisma.whatsAppPhoneNumber.count({
    where: { whatsappAccountId: record.whatsappAccountId },
  });
  if (remaining === 0) {
    await prisma.whatsAppAccount.delete({ where: { id: record.whatsappAccountId } });
  }

  await recordAudit({
    organizationId,
    action: "whatsapp.number.removed",
    entityType: "WhatsAppPhoneNumber",
    entityId: record.id,
    metadata: { phoneNumberId: record.phoneNumberId },
    req,
  });

  return { id: record.id, deleted: true };
}

/**
 * Update a phone number and/or its account credentials. Credentials are tri
 * state: omitted keeps the stored value, an empty string clears it.
 */
export async function updatePhoneNumber({ organizationId, id, data, req = null }) {
  const record = await prisma.whatsAppPhoneNumber.findFirst({
    where: { id, organizationId },
    include: { whatsappAccount: true },
  });
  if (!record) throw new NotFoundError("WhatsApp phone number not found");

  const mode = asEnum(data.providerMode, "providerMode", PROVIDER_MODES);

  const secretData = {};
  for (const key of ["accessToken", "appSecret", "webhookVerifyToken"]) {
    if (data[key] === undefined) continue;
    const value = asString(data[key], key, { max: 2048 });
    secretData[key] = value ? encryptSecret(value) : null;
  }

  if (Object.keys(secretData).length > 0) {
    const nextAccessToken =
      secretData.accessToken === undefined ? record.whatsappAccount.accessToken : secretData.accessToken;

    await prisma.whatsAppAccount.update({
      where: { id: record.whatsappAccountId },
      data: {
        ...secretData,
        status: nextAccessToken ? "ACTIVE" : record.whatsappAccount.status,
      },
    });
  }

  const updated = await prisma.whatsAppPhoneNumber.update({
    where: { id: record.id },
    data: {
      displayPhoneNumber: asString(data.displayPhoneNumber, "displayPhoneNumber", { max: 40 }) ?? undefined,
      verifiedName: asString(data.verifiedName, "verifiedName", { max: 120 }) ?? undefined,
      phoneNumberId:
        data.phoneNumberId === undefined
          ? undefined
          : asString(data.phoneNumberId, "phoneNumberId", { required: true, max: 64 }),
      providerMode: mode ?? undefined,
      status:
        mode === PROVIDER_MODE.SIMULATOR
          ? "CONNECTED"
          : asEnum(data.status, "status", ["PENDING", "CONNECTED", "FLAGGED", "DISCONNECTED"]),
    },
    include: { whatsappAccount: true },
  });

  await recordAudit({
    organizationId,
    action: "whatsapp.number.updated",
    entityType: "WhatsAppPhoneNumber",
    entityId: updated.id,
    metadata: { fields: Object.keys(data) },
    req,
  });

  return serializePhoneNumber(updated);
}

/**
 * Ask Meta about the number with the stored token. This is the "is my setup
 * right?" check an operator runs after pasting credentials.
 */
export async function verifyPhoneNumber({ organizationId, id, req = null }) {
  const record = await prisma.whatsAppPhoneNumber.findFirst({
    where: { id, organizationId },
    include: { whatsappAccount: true },
  });
  if (!record) throw new NotFoundError("WhatsApp phone number not found");

  if (record.providerMode === PROVIDER_MODE.SIMULATOR) {
    const updated = await prisma.whatsAppPhoneNumber.update({
      where: { id: record.id },
      data: { status: "CONNECTED" },
      include: { whatsappAccount: true },
    });
    return {
      ok: true,
      mode: "simulator",
      message: "Simulator mode is always connected; outbound messages stay local.",
      number: serializePhoneNumber(updated),
    };
  }

  const accessToken = await resolveAccessTokenForAccount(record.whatsappAccount);
  if (!accessToken) {
    throw new ValidationError(
      "No access token stored. Paste one here or in Settings → API credentials.",
    );
  }

  const meta = await getMetaConfig({ organizationId });

  try {
    const response = await getPhoneNumberFromMeta(record.phoneNumberId, {
      accessToken,
      baseUrl: meta.graphApiBaseUrl,
      version: meta.graphApiVersion,
    });

    const updated = await prisma.whatsAppPhoneNumber.update({
      where: { id: record.id },
      data: {
        status: "CONNECTED",
        verifiedName: response.verified_name ?? record.verifiedName,
        displayPhoneNumber: response.display_phone_number ?? record.displayPhoneNumber,
        qualityRating: response.quality_rating ?? record.qualityRating,
      },
      include: { whatsappAccount: true },
    });

    await recordAudit({
      organizationId,
      action: "whatsapp.number.verified",
      entityType: "WhatsAppPhoneNumber",
      entityId: record.id,
      metadata: { ok: true },
      req,
    });

    return { ok: true, mode: "meta", number: serializePhoneNumber(updated) };
  } catch (error) {
    logger.warn("Phone number verification failed", { error: error.message });
    await prisma.whatsAppPhoneNumber.update({
      where: { id: record.id },
      data: { status: "FLAGGED" },
    });
    await recordAudit({
      organizationId,
      action: "whatsapp.number.verify_failed",
      entityType: "WhatsAppPhoneNumber",
      entityId: record.id,
      metadata: { error: error.message },
      req,
    });

    return { ok: false, mode: "meta", error: error.message };
  }
}

/**
 * Approved message templates for the account's WABA (legacy helper kept for
 * the inbox/test pickers; template management uses `templates.listTemplates`).
 */
export async function listApprovedTemplates({ organizationId, wabaId = null, phoneNumberId = null }) {
  const context = await resolveMetaAccountContext({ organizationId, phoneNumberId, wabaId });
  const response = await getTemplatesFromMeta(context.wabaId, {
    ...context.requestOptions,
    status: "approved",
    limit: 100,
  });

  return {
    wabaId: context.wabaId,
    templates: (response?.data ?? [])
      .filter((template) => String(template.status ?? "").toUpperCase() === "APPROVED")
      .map((template) => ({
        id: template.id,
        name: template.name,
        status: template.status,
        category: template.category,
        language: template.language,
        components: template.components ?? [],
      })),
  };
}

/** Webhook health for the WhatsApp page. */export async function getWebhookStatus({ organizationId }) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [lastEvent, events24h, failed24h] = await Promise.all([
    prisma.webhookEvent.findFirst({
      where: { organizationId },
      orderBy: { receivedAt: "desc" },
      select: { id: true, eventType: true, status: true, receivedAt: true, error: true },
    }),
    prisma.webhookEvent.count({ where: { organizationId, receivedAt: { gte: since } } }),
    prisma.webhookEvent.count({
      where: { organizationId, receivedAt: { gte: since }, status: "failed" },
    }),
  ]);

  const numbers = await prisma.whatsAppPhoneNumber.findMany({
    where: { organizationId },
    select: { providerMode: true },
  });

  const meta = await getMetaConfig({ organizationId });

  return {
    verifyTokenConfigured: Boolean(meta.verifyToken),
    appSecretConfigured: Boolean(meta.appSecret),
    accessTokenConfigured: Boolean(meta.accessToken),
    credentialSource: meta.source,
    storedCredentials: meta.stored,
    callbackPath: "/api/webhooks/whatsapp",
    graphApiVersion: meta.graphApiVersion,
    lastEvent,
    events24h,
    failed24h,
    allSimulator: numbers.length > 0 && numbers.every((row) => row.providerMode === PROVIDER_MODE.SIMULATOR),
  };
}

/** Used by the seeder/tests to store a token without exposing the helper. */
export function encryptValue(value) {
  return isEncrypted(value) ? value : encryptSecret(value);
}
