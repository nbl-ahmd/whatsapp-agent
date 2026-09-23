import { prisma } from "../../db/prisma.js";

/**
 * Upsert a contact by WhatsApp id within a tenant. Called once per inbound
 * message (idempotent) and before outbound sends.
 */
export async function upsertContact({ organizationId, waId, profileName, name, phone }) {
  return prisma.contact.upsert({
    where: { organizationId_waId: { organizationId, waId } },
    update: {
      ...(profileName ? { profileName } : {}),
      lastSeenAt: new Date(),
    },
    create: {
      organizationId,
      waId,
      name: name ?? profileName ?? undefined,
      profileName: profileName ?? undefined,
      phone: phone ?? waId,
      lastSeenAt: new Date(),
    },
  });
}

export function getContact({ organizationId, contactId }) {
  return prisma.contact.findFirst({ where: { id: contactId, organizationId } });
}
