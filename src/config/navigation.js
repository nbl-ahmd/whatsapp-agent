import {
  Bot,
  Inbox,
  LayoutDashboard,
  MessageCircle,
  Plug,
  ScrollText,
  Settings,
  Users,
  Workflow,
} from "lucide-react";

/**
 * Primary application navigation. Grouped for the sidebar: the day-to-day work
 * first, then the channel and the record of what happened.
 */
export const NAV_GROUPS = Object.freeze([
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Inbox", href: "/inbox", icon: Inbox, badge: "unread" },
      { label: "Contacts", href: "/contacts", icon: Users },
      { label: "Automations", href: "/automations", icon: Workflow },
      { label: "AI agents", href: "/ai-agents", icon: Bot },
      { label: "Integrations", href: "/integrations", icon: Plug },
    ],
  },
  {
    label: "Channel",
    items: [
      { label: "WhatsApp", href: "/whatsapp", icon: MessageCircle },
      { label: "Logs", href: "/logs", icon: ScrollText },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
]);

export const NAV_ITEMS = Object.freeze(NAV_GROUPS.flatMap((group) => group.items));
