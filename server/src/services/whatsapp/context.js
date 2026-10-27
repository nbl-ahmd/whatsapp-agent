import { prisma } from "../../db/prisma.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { getMetaConfig } from "../settings/index.js";
import { resolveAccessTokenForAccount } from "./credentials.js";

/**
 * Resolve the WABA + token needed for Meta management APIs (templates, Flows).
 * A caller can identify the account by an internal/Meta phone number id or by
 * the WABA id itself. Tenant isolation is enforced here, once, so controllers
 * and services never accept a WABA id without an organization scope.
 */
export async function resolveMetaAccountContext({
  organizationId,
  phoneNumberId = null,
  wabaId = null,
}) {
  let account = null;

  if (phoneNumberId) {
    const number = await prisma.whatsAppPhoneNumber.findFirst({
      where: {
        organizationId,
        OR: [{ id: phoneNumberId }, { phoneNumberId }],
      },
      include: { whatsappAccount: true },
    });
    if (!number) throw new NotFoundError("WhatsApp phone number not found");
    account = number.whatsappAccount;
  } else if (wabaId) {
    account = await prisma.whatsAppAccount.findFirst({
      where: { organizationId, wabaId },
    });
    if (!account) throw new NotFoundError("WhatsApp account not found for this WABA");
  } else {
    account = await prisma.whatsAppAccount.findFirst({
      where: { organizationId, wabaId: { not: null } },
      orderBy: { createdAt: "asc" },
    });
  }

  if (!account?.wabaId) {
    throw new ValidationError(
      "Add a WABA id to this WhatsApp number before managing templates or Flows",
    );
  }

  const accessToken = await resolveAccessTokenForAccount(account);
  if (!accessToken) {
    throw new ValidationError(
      "No access token stored. Add one in Settings → API credentials.",
    );
  }

  const meta = await getMetaConfig({ organizationId });

  return {
    account,
    wabaId: account.wabaId,
    accessToken,
    meta,
    requestOptions: {
      accessToken,
      baseUrl: meta.graphApiBaseUrl,
      version: meta.graphApiVersion,
    },
  };
}
