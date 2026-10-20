import { env } from "../../config/env.js";
import { decryptSecret } from "../../lib/crypto.js";
import { prisma } from "../../db/prisma.js";

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

/** Decrypt an account token, falling back to the global test-number token. */
export function resolveAccessToken(account) {
  const token = account?.accessToken ? decryptSecret(account.accessToken) : null;
  return token || env.meta.accessToken || null;
}
