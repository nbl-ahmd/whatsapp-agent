import { env } from "../../config/env.js";
import { decryptSecret } from "../../lib/crypto.js";
import { prisma } from "../../db/prisma.js";

/**
 * Tenant resolution by `phone_number_id`. The Meta webhook tells us which of
 * our phone numbers received the event; that is the only trusted way to map an
 * inbound event to an organization.
 */
export async function resolvePhoneNumberContext(phoneNumberId) {
  if (!phoneNumberId) return null;
  return prisma.whatsAppPhoneNumber.findUnique({
    where: { phoneNumberId },
    include: { whatsappAccount: true },
  });
}

/** Decrypt an account token, falling back to the global test-number token. */
export function resolveAccessToken(account) {
  const token = account?.accessToken ? decryptSecret(account.accessToken) : null;
  return token || env.meta.accessToken || null;
}
