"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, Clock, RefreshCw, ScrollText, Workflow } from "lucide-react";
import { useResource } from "@/lib/useResource";
import { formatDateTime, formatRelative, titleCase } from "@/lib/format";
import {
  EmptyState,
  ErrorAlert,
  LoadingRows,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Logs: three views of one pipeline — webhook events as received, automation
 * runs with their outcome, and the audit trail of who changed what.
 */

const TABS = [
  { id: "events", label: "Webhook events" },
  { id: "runs", label: "Automation runs" },
  { id: "audit", label: "Audit" },
];

const STATUS_TONE = {
  failed: "red",
  error: "red",
  processed: "green",
  success: "green",
  received: "amber",
  pending: "amber",
  queued: "amber",
  skipped: "zinc",
};

function EventPayload({ payload }) {
  if (!payload) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <details className="group">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
        Payload
      </summary>
      <pre className="mt-2 max-h-64 overflow-auto rounded-lg border bg-muted/50 p-3 text-[11px] leading-4">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </details>
  );
}

export default function LogsPage() {
  const [tab, setTab] = useState("events");
  const events = useResource("/api/logs/webhook-events?limit=60");
  const runs = useResource("/api/logs/automation-runs?limit=60");
  const audit = useResource("/api/logs/audit?limit=80");

  const resource = tab === "events" ? events : tab === "runs" ? runs : audit;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Logs"
        description="Every inbound event is stored before it is processed, so a failure here is evidence, not a guess."
        actions={
          <Button variant="outline" onClick={resource.reload}>
            <RefreshCw />
            Refresh
          </Button>
        }
      />

      {events.data?.failedToday > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            <span className="font-semibold">
              {events.data.failedToday} webhook events failed in the last 24 hours.
            </span>{" "}
            Open the event to read the stored error.
          </p>
        </div>
      ) : null}

      <ErrorAlert error={resource.error} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {TABS.map((item) => (
            <TabsTrigger key={item.id} value={item.id}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === "events" ? (
        <SectionCard
          title="Webhook events"
          description={`${events.data?.events?.length ?? 0} events shown`}
          contentClassName="px-0"
        >
          {events.loading && !events.data ? (
            <div className="px-4">
              <LoadingRows rows={5} />
            </div>
          ) : (events.data?.events ?? []).length === 0 ? (
            <div className="px-4">
              <EmptyState
                icon={ScrollText}
                title="No webhook events yet"
                description="Meta posts here once the callback URL is configured and a message is received."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Received</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Processed</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(events.data?.events ?? []).map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap">
                      <div className="text-sm">{formatDateTime(event.receivedAt)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatRelative(event.receivedAt)}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="text-sm">{titleCase(event.eventType ?? "unknown")}</div>
                      <div className="text-xs text-muted-foreground">{event.source}</div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={STATUS_TONE[event.status] ?? "zinc"}>
                        {titleCase(event.status)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground md:table-cell">
                      {event.processedAt ? formatDateTime(event.processedAt) : "—"}
                    </TableCell>
                    <TableCell className="max-w-sm whitespace-normal">
                      {event.error ? (
                        <span className="text-xs text-rose-600 dark:text-rose-400">
                          {event.error}
                        </span>
                      ) : (
                        <EventPayload payload={event.payload} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      ) : null}

      {tab === "runs" ? (
        <SectionCard
          title="Automation runs"
          description={`${runs.data?.runs?.length ?? 0} runs shown`}
          contentClassName="px-0"
        >
          {runs.loading && !runs.data ? (
            <div className="px-4">
              <LoadingRows rows={5} />
            </div>
          ) : (runs.data?.runs ?? []).length === 0 ? (
            <div className="px-4">
              <EmptyState
                icon={Workflow}
                title="No runs yet"
                description="Runs appear when an automation fires for its trigger event."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>When</TableHead>
                  <TableHead>Automation</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Contact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(runs.data?.runs ?? []).map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="size-3.5" />
                        {formatDateTime(run.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {run.automation?.name ?? "Automation"}
                    </TableCell>
                    <TableCell className="text-sm">{titleCase(run.eventType)}</TableCell>
                    <TableCell>
                      <StatusBadge tone={STATUS_TONE[run.status] ?? "zinc"}>
                        {run.status === "failed" ? (
                          <CircleAlert className="size-3" />
                        ) : (
                          <CheckCircle2 className="size-3" />
                        )}
                        {titleCase(run.status)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {run.contact?.name ?? run.contact?.waId ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      ) : null}

      {tab === "audit" ? (
        <SectionCard
          title="Audit trail"
          description={`${audit.data?.logs?.length ?? 0} entries shown`}
          contentClassName="px-0"
        >
          {audit.loading && !audit.data ? (
            <div className="px-4">
              <LoadingRows rows={5} />
            </div>
          ) : (audit.data?.logs ?? []).length === 0 ? (
            <div className="px-4">
              <EmptyState icon={ScrollText} title="Nothing recorded yet" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="text-right">Entity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(audit.data?.logs ?? []).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(log.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">{log.user?.name ?? "system"}</TableCell>
                    <TableCell>
                      <StatusBadge tone="zinc" className="font-mono">
                        {log.action}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {log.entityType ?? "—"} {log.entityId ? `· ${log.entityId}` : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      ) : null}
    </div>
  );
}
