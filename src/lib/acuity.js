/**
 * Acuity: how loudly a conversation needs a person.
 *
 * This is the desk's ranking, derived from what the backend already records —
 * conversation mode, unread count, who owns it and when it last moved. Nothing
 * is stored, so the ranking is always the current truth of the queue.
 */

export const ACUITY = Object.freeze({
  1: {
    level: 1,
    code: "P1",
    label: "Needs a person",
    stamp: "NEEDS",
    kind: "critical",
    promise: "Someone is waiting and nobody has answered.",
  },
  2: {
    level: 2,
    code: "P2",
    label: "Watch",
    stamp: "WATCH",
    kind: "watch",
    promise: "A person owns it, or the AI is still answering.",
  },
  3: {
    level: 3,
    code: "P3",
    label: "AI holding",
    stamp: "AI",
    kind: "holding",
    promise: "The AI has it and the customer is answered.",
  },
  4: {
    level: 4,
    code: "P4",
    label: "Closed",
    stamp: "CLOSED",
    kind: "closed",
    promise: "Nothing is owed.",
  },
});

export const ACUITY_LIST = [ACUITY[1], ACUITY[2], ACUITY[3], ACUITY[4]];

const STALE_HUMAN_MINUTES = 15;
const STALLED_AI_MINUTES = 10;

function minutesSince(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const at = new Date(value).getTime();
  if (Number.isNaN(at)) return Number.POSITIVE_INFINITY;
  return (Date.now() - at) / 60000;
}

/**
 * @param {{ mode?: string, status?: string, unreadCount?: number, assignedUserId?: string|null, lastMessageAt?: string|Date }} conversation
 */
export function acuityOf(conversation) {
  if (!conversation) return ACUITY[4];
  if (conversation.status === "closed") return ACUITY[4];

  const unread = Number(conversation.unreadCount || 0);
  const age = minutesSince(conversation.lastMessageAt);

  if (conversation.mode === "human") {
    // A person took it: an unanswered inbound is a promise already drifting.
    if (unread > 0 && age >= STALE_HUMAN_MINUTES) return ACUITY[1];
    if (unread > 0) return ACUITY[2];
    return ACUITY[2];
  }

  if (conversation.mode === "paused") return ACUITY[2];

  // mode === "ai": the AI should have answered within seconds.
  if (unread > 0 && age >= STALLED_AI_MINUTES) return ACUITY[1];
  if (unread > 0) return ACUITY[2];
  return ACUITY[3];
}

/** Why a conversation ranks where it does, in one short line. */
export function acuityReason(conversation) {
  if (!conversation) return "";
  if (conversation.status === "closed") return "Closed";

  const level = acuityOf(conversation).level;
  const unread = Number(conversation.unreadCount || 0);

  if (level === 1) {
    return conversation.mode === "human"
      ? `Human mode, ${unread || 0} unanswered`
      : `AI silent for ${formatShortAge(conversation.lastMessageAt)}`;
  }
  if (level === 2) {
    if (conversation.mode === "paused") return "Paused by an operator";
    if (conversation.mode === "human") return "Human mode, answered";
    return "AI answering now";
  }
  if (level === 3) return "AI holding, answered";
  return "Closed";
}

/** Rank order: highest acuity first, then the longest-waiting promise. */
export function rankConversations(conversations = []) {
  return [...conversations].sort((a, b) => {
    const left = acuityOf(a).level;
    const right = acuityOf(b).level;
    if (left !== right) return left - right;

    const leftAt = new Date(a.lastMessageAt || a.createdAt || 0).getTime();
    const rightAt = new Date(b.lastMessageAt || b.createdAt || 0).getTime();
    return leftAt - rightAt;
  });
}

export function countByAcuity(conversations = []) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const conversation of conversations) counts[acuityOf(conversation).level] += 1;
  return counts;
}

/** "14 min", "2 h", "3 d" — the age column on the strip. */
export function formatShortAge(value) {
  if (!value) return "—";
  const minutes = Math.max(0, Math.round(minutesSince(value)));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return `${days} d`;
}
