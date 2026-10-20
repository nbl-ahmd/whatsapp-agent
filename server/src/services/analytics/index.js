import { prisma } from "../../db/prisma.js";

/**
 * Operational counts for the dashboard and Logs page. Everything is scoped to
 * one organization and computed with cheap aggregate queries.
 */

export const descriptor = Object.freeze({
  name: "analytics",
  phase: 9,
  description: "Organization-scoped metrics.",
});

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function getDashboard({ organizationId }) {
  const since = startOfToday();

  const [
    conversationsByMode,
    conversationsByStatus,
    unreadConversations,
    contactsTotal,
    messagesToday,
    messagesOutboundToday,
    activeAutomations,
    phoneNumbers,
    recentConversations,
    recentRuns,
    handoffsToday,
  ] = await Promise.all([
    prisma.conversation.groupBy({
      by: ["mode"],
      where: { organizationId },
      _count: { _all: true },
    }),
    prisma.conversation.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: { _all: true },
    }),
    prisma.conversation.count({ where: { organizationId, unreadCount: { gt: 0 } } }),
    prisma.contact.count({ where: { organizationId } }),
    prisma.message.count({
      where: { organizationId, direction: "inbound", timestamp: { gte: since } },
    }),
    prisma.message.count({
      where: { organizationId, direction: "outbound", timestamp: { gte: since } },
    }),
    prisma.automation.count({
      where: { organizationId, isActive: true, name: { not: { startsWith: "[system]" } } },
    }),
    prisma.whatsAppPhoneNumber.findMany({
      where: { organizationId },
      select: {
        id: true,
        displayPhoneNumber: true,
        status: true,
        providerMode: true,
        verifiedName: true,
        phoneNumberId: true,
        whatsappAccount: { select: { name: true, status: true } },
      },
    }),
    prisma.conversation.findMany({
      where: { organizationId },
      orderBy: [{ lastMessageAt: "desc" }],
      take: 6,
      include: {
        contact: { select: { id: true, name: true, profileName: true, waId: true } },
        assignedUser: { select: { id: true, name: true } },
      },
    }),
    prisma.automationRun.findMany({
      where: { organizationId, automation: { name: { not: { startsWith: "[system]" } } } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { automation: { select: { name: true, id: true } } },
    }),
    prisma.automationRun.count({
      where: { organizationId, eventType: "HUMAN_HANDOFF", createdAt: { gte: since } },
    }),
  ]);

  const modeOf = (mode) => conversationsByMode.find((row) => row.mode === mode)?._count._all ?? 0;
  const statusOf = (status) =>
    conversationsByStatus.find((row) => row.status === status)?._count._all ?? 0;

  return {
    conversations: {
      total: conversationsByStatus.reduce((sum, row) => sum + row._count._all, 0),
      open: statusOf("open"),
      pending: statusOf("pending"),
      closed: statusOf("closed"),
      unread: unreadConversations,
      ai: modeOf("ai"),
      human: modeOf("human"),
      paused: modeOf("paused"),
    },
    contacts: { total: contactsTotal },
    messages: { inboundToday: messagesToday, outboundToday: messagesOutboundToday },
    automations: { active: activeAutomations },
    handoffsToday,
    phoneNumbers,
    recentConversations,
    recentRuns,
  };
}
