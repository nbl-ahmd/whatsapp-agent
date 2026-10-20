/** Display formatting shared by the desk's screens. */

export function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatDay(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today.getTime() - 86400000);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "2-digit" });
}

export function formatRelative(value) {
  if (!value) return "—";
  const minutes = (Date.now() - new Date(value).getTime()) / 60000;
  if (!Number.isFinite(minutes)) return "—";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)} h ago`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)} d ago`;
  return new Date(value).toLocaleDateString();
}

export function titleCase(value) {
  if (!value) return "";
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function personName(contact) {
  if (!contact) return "Unknown contact";
  return contact.name || contact.profileName || contact.waId || "Unknown contact";
}

export function phoneOf(contact) {
  if (!contact) return "—";
  return contact.phone || contact.waId || "—";
}

/** "AI" / "Human" / "Paused" — the responder, never a status. */
export function modeLabel(mode) {
  if (mode === "human") return "Human";
  if (mode === "paused") return "Paused";
  return "AI";
}
