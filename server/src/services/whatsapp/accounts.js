import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { recordAudit } from "../../lib/audit.js";
import { encryptSecret, isEncrypted } from "../../lib/crypto.js";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { asEnum, asString } from "../../lib/validate.js";
import { getPhoneNumber as getPhoneNumberFromMeta } from "./service.js";
import { PROVIDER_MODE } from "../messages/outbound.js";
import { resolveAccessToken } from "./credentials.js";

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

  const account = await prisma.whatsAppAccount.create({
    data: {
      organizationId,
      name: accountName,
      wabaId: asString(wabaId, "wabaId", { max: 64 }),
      accessToken: accessToken ? encryptSecret(accessToken) : null,
      appSecret: appSecret ? encryptSecret(appSecret) : null,
      webhookVerifyToken: webhookVerifyToken ? encryptSecret(webhookVerifyToken) : null,
      status: accessToken ? "ACTIVE" : "PENDING",
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

  const accessToken = resolveAccessToken(record.whatsappAccount);
  if (!accessToken) {
    throw new ValidationError(
      "No access token stored for this account. Paste a token in WhatsApp settings first.",
    );
  }

  try {
    const response = await getPhoneNumberFromMeta(record.phoneNumberId, { accessToken });

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

/** Webhook health for the WhatsApp page. */
export async function getWebhookStatus({ organizationId }) {
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

  return {
    verifyTokenConfigured: Boolean(env.meta.verifyToken),
    appSecretConfigured: Boolean(env.meta.appSecret),
    callbackPath: "/api/webhooks/whatsapp",
    graphApiVersion: env.meta.graphApiVersion,
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
