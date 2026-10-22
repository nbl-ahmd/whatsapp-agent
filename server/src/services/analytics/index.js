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

/**
 * Message and conversation counts per UTC day for the dashboard chart.
 *
 * Uses two small aggregate queries rather than loading rows: the bucket list is
 * built in JS so days with no activity still appear. `timestamp`/`createdAt`
 * are indexed by organization, so the range scan stays cheap.
 */
export async function getActivity({ organizationId, days = 7 }) {
  const windowDays = Math.min(Math.max(Number(days) || 7, 1), 30);
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (windowDays - 1)),
  );

  const [messageRows, conversationRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT
        to_char(date_trunc('day', "timestamp" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
        COUNT(*) FILTER (WHERE "direction" = 'inbound')::int AS inbound,
        COUNT(*) FILTER (WHERE "direction" = 'outbound')::int AS outbound
      FROM "Message"
      WHERE "organizationId" = ${organizationId}
        AND "timestamp" >= ${start}
      GROUP BY 1
    `,
    prisma.$queryRaw`
      SELECT
        to_char(date_trunc('day', "createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS conversations
      FROM "Conversation"
      WHERE "organizationId" = ${organizationId}
        AND "createdAt" >= ${start}
      GROUP BY 1
    `,
  ]);

  const buckets = new Map();
  for (let index = 0; index < windowDays; index += 1) {
    const key = new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10);
    buckets.set(key, { date: key, inbound: 0, outbound: 0, conversations: 0 });
  }

  for (const row of messageRows) {
    const bucket = buckets.get(row.date);
    if (!bucket) continue;
    bucket.inbound += Number(row.inbound);
    bucket.outbound += Number(row.outbound);
  }

  for (const row of conversationRows) {
    const bucket = buckets.get(row.date);
    if (bucket) bucket.conversations += Number(row.conversations);
  }

  return { days: windowDays, timezone: "UTC", buckets: [...buckets.values()] };
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
    activity,
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
    getActivity({ organizationId }),
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
    activity,
    phoneNumbers,
    recentConversations,
    recentRuns,
  };
}
