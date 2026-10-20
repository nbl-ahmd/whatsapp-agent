"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  ChevronDown,
  ChevronsUpDown,
  LogOut,
  MessageCircle,
  Search,
  Settings as SettingsIcon,
  UserRound,
} from "lucide-react";
import { NAV_GROUPS, NAV_ITEMS } from "@/config/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { PersonAvatar } from "@/components/ui";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

/**
 * The desk frame: a quiet sidebar for the sections, a sticky top bar for search,
 * channel health and the signed-in operator. Search is a real command palette.
 */

const HEALTH_TONE = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-rose-500",
  idle: "bg-zinc-300",
};

function initials(name = "") {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "OP"
  );
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, organization, signOut } = useAuth();
  const [overview, setOverview] = useState(null);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get("/api/dashboard")
      .then((data) => active && setOverview(data))
      .catch(() => active && setOverview({ numbers: [] }));
    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const isCurrent = (href) => pathname === href || pathname.startsWith(`${href}/`);
  const unread = overview?.conversations?.unread ?? 0;

  const numbers = overview?.phoneNumbers ?? [];
  const health = (() => {
    if (!overview) return { tone: "idle", text: "Checking number" };
    if (numbers.length === 0) return { tone: "bad", text: "No number connected" };
    const pending = numbers.filter(
      (row) => row.status !== "CONNECTED" && row.status !== "ACTIVE",
    ).length;
    if (pending > 0) return { tone: "warn", text: `${pending} number pending` };
    const simulator = numbers.filter((row) => row.providerMode === "simulator").length;
    if (simulator === numbers.length) {
      return { tone: "warn", text: `${numbers.length} number · simulator` };
    }
    return { tone: "ok", text: `${numbers.length} number live` };
  })();

  const go = (href) => {
    setCommandOpen(false);
    router.push(href);
  };

  const handleSignOut = () => {
    signOut();
    router.replace("/login");
  };

  return (
    <SidebarProvider>
      <a
        href="#desk"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-1 focus:ring-ring"
      >
        Skip to content
      </a>

      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link href="/dashboard" className="data-[active=true]:bg-transparent">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                    <MessageCircle className="size-4" />
                  </span>
                  <span className="grid min-w-0 flex-1 leading-tight">
                    <span className="truncate text-sm font-semibold">WhatsApp Agent</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {organization?.name ?? "Operator desk"}
                    </span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {NAV_GROUPS.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isCurrent(item.href);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                          <Link href={item.href}>
                            <Icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                        {item.badge === "unread" && unread > 0 ? (
                          <SidebarMenuBadge className="bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                            {unread}
                          </SidebarMenuBadge>
                        ) : null}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                    <Avatar className="size-8 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                        {initials(user?.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="grid min-w-0 flex-1 leading-tight">
                      <span className="truncate text-sm font-medium">{user?.name ?? "Operator"}</span>
                      <span className="truncate text-xs text-muted-foreground capitalize">
                        {user?.role?.toLowerCase() ?? "agent"}
                      </span>
                    </span>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <span className="block text-sm font-medium">{user?.name}</span>
                    <span className="block text-xs text-muted-foreground">{user?.email}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => go("/settings")}>
                    <SettingsIcon />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handleSignOut}>
                    <LogOut />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset id="desk">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-sm md:px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-5" />

          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="group hidden h-8 w-full max-w-xs items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground transition-colors hover:text-foreground sm:flex"
          >
            <Search className="size-4" />
            <span>Search…</span>
            <kbd className="ml-auto rounded border bg-background px-1.5 font-sans text-[11px] font-medium text-muted-foreground">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
              <span className={`size-2 rounded-full ${HEALTH_TONE[health.tone]}`} />
              {health.text}
            </span>

            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account">
                  <PersonAvatar name={user?.name} className="size-8" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <span className="block text-sm font-medium">{user?.name}</span>
                  <span className="block text-xs text-muted-foreground">{user?.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => go("/settings")}>
                  <UserRound />
                  Profile & settings
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleSignOut}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-5 p-4 md:p-6">{children}</div>
      </SidebarInset>

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Jump to a page…" />
        <CommandList>
          <CommandEmpty>No matching page.</CommandEmpty>
          <CommandGroup heading="Pages">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}>
                  <Icon />
                  <span>{item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Account">
            <CommandItem value="Sign out" onSelect={handleSignOut}>
              <LogOut />
              <span>Sign out</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </SidebarProvider>
  );
}
