import { env } from "../../config/env.js";
import { decryptSecret } from "../../lib/crypto.js";
import { prisma } from "../../db/prisma.js";
import { getMetaConfig } from "../settings/index.js";

/**
 * Tenant resolution by `phone_number_id`. The Meta webhook tells us which of
 * our phone numbers received the event; that is the only trusted way to map an
 * inbound event to an organization.
 *
 * Internal callers (inbox, automations, AI) hold the database record id instead,
 * so both identifiers resolve here.
 */
export async function resolvePhoneNumberContext(identifier) {
  if (!identifier) return null;
  return prisma.whatsAppPhoneNumber.findFirst({
    where: { OR: [{ id: identifier }, { phoneNumberId: identifier }] },
    include: { whatsappAccount: true },
  });
}

/** Decrypt an account token, falling back to the organization/settings token. */
export function resolveAccessToken(account, fallbackToken = null) {
  const token = account?.accessToken ? decryptSecret(account.accessToken) : null;
  return token || fallbackToken || env.meta.accessToken || null;
}

/**
 * Resolve the token an account should send with: its own token first, then the
 * organization's BYOK token, then the server env token.
 */
export async function resolveAccessTokenForAccount(account) {
  const token = account?.accessToken ? decryptSecret(account.accessToken) : null;
  if (token) return token;
  if (env.meta.accessToken) return env.meta.accessToken;
  if (account?.organizationId) {
    const meta = await getMetaConfig({ organizationId: account.organizationId });
    return meta.accessToken || null;
  }
  return null;
}
