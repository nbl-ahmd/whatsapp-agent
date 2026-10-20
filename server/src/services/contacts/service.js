import { NotFoundError } from "../../lib/errors.js";
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

/** Contact plus the thread history the contact page shows. */
export async function getContactDetail({ organizationId, contactId }) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organizationId },
    include: {
      conversations: {
        orderBy: [{ lastMessageAt: "desc" }],
        include: { phoneNumber: { select: { id: true, displayPhoneNumber: true } } },
        take: 20,
      },
    },
  });

  if (!contact) throw new NotFoundError("Contact not found");
  return contact;
}

export async function listContacts({ organizationId, search = null, tag = null, take = 100 }) {
  const where = { organizationId };
  if (tag) where.tags = { has: tag };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { profileName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { waId: { contains: search } },
    ];
  }

  return prisma.contact.findMany({
    where,
    orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
    take,
    include: {
      _count: { select: { conversations: true, messages: true } },
    },
  });
}

export async function updateContact({ organizationId, contactId, data }) {
  const contact = await getContact({ organizationId, contactId });
  if (!contact) throw new NotFoundError("Contact not found");

  return prisma.contact.update({
    where: { id: contact.id },
    data: {
      name: data.name === undefined ? undefined : data.name,
      email: data.email === undefined ? undefined : data.email,
      locale: data.locale === undefined ? undefined : data.locale,
      attributes: data.attributes === undefined ? undefined : data.attributes,
      tags: data.tags === undefined ? undefined : data.tags,
    },
  });
}

export async function addContactTag({ organizationId, contactId, tag }) {
  const contact = await getContact({ organizationId, contactId });
  if (!contact) throw new NotFoundError("Contact not found");
  if (contact.tags.includes(tag)) return contact;

  return prisma.contact.update({
    where: { id: contact.id },
    data: { tags: { push: tag } },
  });
}

export async function removeContactTag({ organizationId, contactId, tag }) {
  const contact = await getContact({ organizationId, contactId });
  if (!contact) throw new NotFoundError("Contact not found");

  return prisma.contact.update({
    where: { id: contact.id },
    data: { tags: contact.tags.filter((value) => value !== tag) },
  });
}

/** Distinct tags in use, for filters and tag pickers. */
export async function listContactTags({ organizationId }) {
  const rows = await prisma.contact.findMany({
    where: { organizationId },
    select: { tags: true },
  });

  return {
    tags: [...new Set(rows.flatMap((row) => row.tags))].sort((a, b) => a.localeCompare(b)),
  };
}
