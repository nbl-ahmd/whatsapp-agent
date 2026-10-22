"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
} from "recharts";
import {
  ArrowUpRight,
  CircleCheck,
  CircleAlert,
  Clock,
  Headset,
  Inbox,
  MailOpen,
  Plug,
  Webhook,
  Workflow,
} from "lucide-react";
import { useResource } from "@/lib/useResource";
import { acuityOf, formatShortAge, rankConversations } from "@/lib/acuity";
import { formatRelative, formatTime, personName, titleCase } from "@/lib/format";
import { useAuth } from "@/components/AuthProvider";
import {
  EmptyState,
  ErrorAlert,
  LoadingGrid,
  ModePill,
  PageHeader,
  PersonAvatar,
  PriorityBadge,
  SectionCard,
  StatCard,
  StatusBadge,
} from "@/components/ui";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const volumeConfig = {
  inbound: { label: "Inbound", color: "var(--chart-1)" },
  outbound: { label: "Outbound", color: "var(--chart-2)" },
};

export default function DashboardPage() {
  const { user } = useAuth();
  const dashboard = useResource("/api/dashboard");
  const conversationsRes = useResource("/api/conversations?limit=100", { refreshMs: 30000 });
  const webhook = useResource("/api/whatsapp/webhook-status");

  const data = dashboard.data;
  const conversations = useMemo(
    () => conversationsRes.data?.conversations ?? [],
    [conversationsRes.data],
  );

  const ranked = useMemo(
    () => rankConversations(conversations).slice(0, 6),
    [conversations],
  );

  const volume = useMemo(() => {
    const buckets = data?.activity?.buckets ?? [];
    return buckets.map((bucket) => ({
      day: new Date(`${bucket.date}T00:00:00Z`).toLocaleDateString([], {
        weekday: "short",
        timeZone: "UTC",
      }),
      inbound: bucket.inbound,
      outbound: bucket.outbound,
    }));
  }, [data]);

  const modeMix = useMemo(() => {
    if (!data) return [];
    return [
      { name: "AI", value: data.conversations.ai, fill: "var(--chart-1)" },
      { name: "Human", value: data.conversations.human, fill: "var(--chart-2)" },
      { name: "Paused", value: data.conversations.paused, fill: "var(--chart-5)" },
      { name: "Closed", value: data.conversations.closed, fill: "var(--chart-3)" },
    ].filter((entry) => entry.value > 0);
  }, [data]);

  const today = new Date().toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const greeting = new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening";
  const numbers = data?.phoneNumbers ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Good ${greeting}, ${user?.name?.split(" ")[0] ?? "operator"}`}
        description={`${today} · Here is how the desk is doing right now.`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/whatsapp">
                <Plug />
                Connection
              </Link>
            </Button>
            <Button asChild>
              <Link href="/inbox">
                Open inbox
                <ArrowUpRight />
              </Link>
            </Button>
          </>
        }
      />

      <ErrorAlert error={dashboard.error} />

      {!data ? (
        <LoadingGrid />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Open conversations"
              value={data.conversations.open + data.conversations.pending}
              icon={Inbox}
              tone="indigo"
              hint={`${data.conversations.total} total`}
            />
            <StatCard
              label="Waiting to be read"
              value={data.conversations.unread}
              icon={MailOpen}
              tone={data.conversations.unread > 0 ? "amber" : "green"}
              hint="Unanswered inbound"
            />
            <StatCard
              label="Handoffs today"
              value={data.handoffsToday}
              icon={Headset}
              tone={data.handoffsToday > 0 ? "red" : "zinc"}
              hint="Moved to a person"
            />
            <StatCard
              label="Active automations"
              value={data.automations.active}
              icon={Workflow}
              tone="violet"
              hint="Running event rules"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard
              title="Message volume"
              description="Inbound and outbound, last 7 days"
              className="lg:col-span-2"
            >
              <ChartContainer config={volumeConfig} className="h-[240px] w-full">
                <AreaChart data={volume} margin={{ left: 4, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="inboundFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="outboundFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="4 4" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Area
                    dataKey="inbound"
                    stackId="messages"
                    type="monotone"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    fill="url(#inboundFill)"
                  />
                  <Area
                    dataKey="outbound"
                    stackId="messages"
                    type="monotone"
                    stroke="var(--chart-2)"
                    strokeWidth={2}
                    fill="url(#outboundFill)"
                  />
                </AreaChart>
              </ChartContainer>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ background: "var(--chart-1)" }} />
                  Inbound
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ background: "var(--chart-2)" }} />
                  Outbound
                </span>
              </div>
            </SectionCard>

            <SectionCard title="Mode mix" description="Who is answering">
              {modeMix.length === 0 ? (
                <EmptyState title="No conversations yet" />
              ) : (
                <>
                  <ChartContainer config={{}} className="mx-auto h-[180px] w-full">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                      <Pie
                        data={modeMix}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={52}
                        outerRadius={80}
                        paddingAngle={3}
                        strokeWidth={0}
                      >
                        {modeMix.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="mt-2 space-y-1.5">
                    {modeMix.map((entry) => (
                      <div key={entry.name} className="flex items-center gap-2 text-sm">
                        <span className="size-2.5 rounded-full" style={{ background: entry.fill }} />
                        <span className="text-muted-foreground">{entry.name}</span>
                        <span className="ml-auto font-medium tabular-nums">{entry.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </SectionCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard
              title="Queue right now"
              description="Ranked by who needs a person"
              className="lg:col-span-2"
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/inbox">
                    Open inbox
                    <ArrowUpRight />
                  </Link>
                </Button>
              }
              contentClassName="pt-0"
            >
              {ranked.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="No conversations yet"
                  description="Send a WhatsApp message to the connected number to see it appear here."
                />
              ) : (
                <ul className="-mx-2 divide-y">
                  {ranked.map((conversation) => (
                    <li key={conversation.id}>
                      <Link
                        href="/inbox"
                        className="flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/60"
                      >
                        <PersonAvatar name={personName(conversation.contact)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {personName(conversation.contact)}
                            </span>
                            <ModePill mode={conversation.mode} />
                          </div>
                          <p className="truncate text-sm text-muted-foreground">
                            {conversation.lastMessagePreview || "No message preview"}
                          </p>
                        </div>
                        <div className="hidden shrink-0 items-center gap-3 sm:flex">
                          <PriorityBadge level={acuityOf(conversation).level} />
                          <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                            {formatShortAge(conversation.lastMessageAt)}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <div className="space-y-4">
              <SectionCard title="Delivery pipeline" description="Webhook health">
                {webhook.data ? (
                  <dl className="space-y-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">Events (24 h)</dt>
                      <dd className="font-medium tabular-nums">{webhook.data.events24h}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">Failed (24 h)</dt>
                      <dd>
                        {webhook.data.failed24h ? (
                          <StatusBadge tone="red">{webhook.data.failed24h} failed</StatusBadge>
                        ) : (
                          <StatusBadge tone="green">
                            <CircleCheck className="size-3" />
                            None
                          </StatusBadge>
                        )}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">Last event</dt>
                      <dd className="font-medium">
                        {webhook.data.lastEvent
                          ? formatRelative(webhook.data.lastEvent.receivedAt)
                          : "none yet"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">Verify token</dt>
                      <dd>
                        <ConfigBadge ok={webhook.data.verifyTokenConfigured} />
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">App secret</dt>
                      <dd>
                        <ConfigBadge ok={webhook.data.appSecretConfigured} />
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">Graph API</dt>
                      <dd className="font-mono text-xs">{webhook.data.graphApiVersion}</dd>
                    </div>
                  </dl>
                ) : (
                  <div className="space-y-2">
                    <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Numbers" description="Connected channels">
                {numbers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No number connected.{" "}
                    <Link href="/whatsapp" className="font-medium text-primary hover:underline">
                      Add one
                    </Link>
                    .
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {numbers.map((number) => (
                      <li key={number.id} className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-600/20">
                          <Webhook className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{number.displayPhoneNumber}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {number.verifiedName ?? "unnamed"}
                          </p>
                        </div>
                        <StatusBadge tone={number.providerMode === "simulator" ? "amber" : "green"}>
                          {number.providerMode}
                        </StatusBadge>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>
          </div>

          <SectionCard
            title="Recent automation runs"
            description="What the rules did lately"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/logs">
                  All runs
                  <ArrowUpRight />
                </Link>
              </Button>
            }
            contentClassName="px-0"
          >
            {data.recentRuns.length === 0 ? (
              <EmptyState
                icon={Workflow}
                title="No runs yet"
                description="Automations run when their trigger event arrives."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Automation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentRuns.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="font-medium">
                        {run.automation?.name ?? "Automation"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={run.status === "failed" ? "red" : "green"}>
                          {run.status === "failed" ? (
                            <CircleAlert className="size-3" />
                          ) : (
                            <CircleCheck className="size-3" />
                          )}
                          {titleCase(run.status)}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="size-3.5" />
                          {formatTime(run.createdAt)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}

function ConfigBadge({ ok }) {
  return ok ? (
    <StatusBadge tone="green">
      <CircleCheck className="size-3" />
      Set
    </StatusBadge>
  ) : (
    <StatusBadge tone="amber">
      <CircleAlert className="size-3" />
      Missing
    </StatusBadge>
  );
}
