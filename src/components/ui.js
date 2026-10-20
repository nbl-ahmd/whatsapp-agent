"use client";

import { cn } from "cn";
import { CircleAlert } from "lucide-react";
import { ACUITY } from "@/lib/acuity";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The desk's shared furniture, cut from the shadcn primitives so every page
 * speaks the same language: soft cards, outlined pills, avatars and quiet type.
 */

const TONES = {
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/15 dark:text-indigo-300",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/15 dark:text-violet-300",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300",
  sky: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/15 dark:text-sky-300",
  zinc: "bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-white/10 dark:text-zinc-300",
};

export function StatusBadge({ tone = "zinc", className, children }) {
  return (
    <span
      className={cn(
        "inline-flex h-5.5 items-center gap-1 rounded-full px-2 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        TONES[tone] ?? TONES.zinc,
        className,
      )}
    >
      {children}
    </span>
  );
}

const PRIORITY = {
  1: { tone: "red", label: "Urgent" },
  2: { tone: "amber", label: "Waiting" },
  3: { tone: "indigo", label: "AI" },
  4: { tone: "zinc", label: "Closed" },
};

export function PriorityBadge({ level, showDot = true, className }) {
  const meta = PRIORITY[level] ?? PRIORITY[4];
  return (
    <StatusBadge tone={meta.tone} className={className}>
      {showDot ? <span className="size-1.5 rounded-full bg-current opacity-70" /> : null}
      {meta.label}
    </StatusBadge>
  );
}

export function PriorityLabel({ level }) {
  return ACUITY[level]?.label ?? "";
}

const MODES = {
  ai: { tone: "indigo", label: "AI" },
  human: { tone: "green", label: "Human" },
  paused: { tone: "amber", label: "Paused" },
};

export function ModePill({ mode, className }) {
  const meta = MODES[mode] ?? MODES.ai;
  return (
    <StatusBadge tone={meta.tone} className={className}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {meta.label}
    </StatusBadge>
  );
}

export function initials(name = "") {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function PersonAvatar({ name, className }) {
  return (
    <Avatar className={className}>
      <AvatarFallback className="bg-indigo-50 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export function PageHeader({ title, description, actions, className }) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
  bodyClassName,
}) {
  return (
    <Card className={cn("gap-4", className)}>
      {title || action ? (
        <CardHeader className={cn("border-b", bodyClassName)}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>{title}</CardTitle>
              {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
        </CardHeader>
      ) : null}
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

export function StatCard({ label, value, icon: Icon, hint, tone = "indigo", className }) {
  return (
    <Card className={cn("gap-0 overflow-hidden", className)}>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {Icon ? (
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset",
              TONES[tone] ?? TONES.indigo,
            )}
          >
            <Icon className="size-4.5" />
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function StatGrid({ children, className }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </span>
      ) : null}
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorAlert({ error, className }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300",
        className,
      )}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{error.message ?? String(error)}</span>
    </div>
  );
}

export function LoadingRows({ rows = 6, className }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function LoadingGrid({ count = 4, className }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-28 w-full rounded-xl" />
      ))}
    </div>
  );
}
