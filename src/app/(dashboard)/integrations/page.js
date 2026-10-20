"use client";

import {
  Boxes,
  Cable,
  CalendarClock,
  Clock,
  Plug,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Users,
} from "lucide-react";
import { useResource } from "@/lib/useResource";
import { formatRelative, titleCase } from "@/lib/format";
import {
  EmptyState,
  ErrorAlert,
  LoadingGrid,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Integrations: the adapter seam the AI tools will call. Phase 7 ships the real
 * CRM/ecommerce/MCP providers; this page shows the contract and what an
 * organization has connected so far.
 */

const CATALOG = [
  {
    category: "crm",
    name: "CRM",
    icon: Users,
    summary: "Read and write customer records in your CRM of record.",
    methods: ["findCustomer", "createCustomer", "updateCustomer", "addNote", "createLead"],
  },
  {
    category: "ecommerce",
    name: "Ecommerce",
    icon: ShoppingCart,
    summary: "Products, orders and checkout, answered from the store, never guessed.",
    methods: ["searchProducts", "getProduct", "getOrder", "listOrders", "createOrder", "cancelOrder"],
  },
  {
    category: "mcp",
    name: "MCP tools",
    icon: Boxes,
    summary: "Bring external tool servers in behind the same tool abstraction.",
    methods: ["listTools", "callTool"],
  },
];

const STATUS_TONE = { connected: "green", active: "green", error: "red", pending: "amber" };

export default function IntegrationsPage() {
  const integrations = useResource("/api/integrations");
  const rows = integrations.data?.integrations ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Integrations"
        description="CRM, ecommerce and MCP providers behind stable adapters. Credentials are stored encrypted and never exposed to the browser."
        actions={
          <Button variant="outline" onClick={integrations.reload}>
            <RefreshCw />
            Refresh
          </Button>
        }
      />

      <ErrorAlert error={integrations.error} />

      <SectionCard
        title="Connected for this organization"
        description="What the AI tool layer can reach right now"
      >
        {integrations.loading && !integrations.data ? (
          <LoadingGrid count={3} className="xl:grid-cols-3" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Plug}
            title="Nothing connected yet"
            description="Adapter providers arrive in phase 7. The contract below is already wired into the tool layer, so providers drop in without touching the AI agent."
          />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <li key={row.id}>
                <Card className="h-full gap-3 py-4">
                  <CardContent className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                          <Cable className="size-4" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold">{row.name}</p>
                          <p className="text-xs text-muted-foreground">{row.provider}</p>
                        </div>
                      </div>
                      <StatusBadge tone={STATUS_TONE[row.status] ?? "zinc"}>
                        {titleCase(row.status)}
                      </StatusBadge>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <StatusBadge tone="indigo">{row.category}</StatusBadge>
                      <StatusBadge tone={row.hasCredentials ? "green" : "amber"}>
                        credentials {row.hasCredentials ? "stored" : "missing"}
                      </StatusBadge>
                    </div>
                    {row.updatedAt ? (
                      <p className="text-xs text-muted-foreground">
                        Updated {formatRelative(row.updatedAt)}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <div>
        <h2 className="text-sm font-semibold">Adapter catalog</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Each provider implements one of these interfaces. The AI agent only ever sees the tool.
        </p>
        <ul className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {CATALOG.map((entry) => {
            const Icon = entry.icon;
            return (
              <li key={entry.category}>
                <Card className="h-full gap-4 py-5">
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-600/15 dark:bg-indigo-500/15 dark:text-indigo-300">
                        <Icon className="size-5" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">{entry.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{entry.category}.*</p>
                      </div>
                      <StatusBadge tone="zinc" className="ml-auto">
                        <Clock className="size-3" />
                        phase 7
                      </StatusBadge>
                    </div>
                    <p className="text-sm text-muted-foreground">{entry.summary}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {entry.methods.map((method) => (
                        <code
                          key={method}
                          className="rounded-md border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                        >
                          {method}()
                        </code>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      </div>

      <SectionCard title="How tools reach providers" description="One seam, many providers">
        <div className="grid gap-4 text-sm sm:grid-cols-3">
          <Step
            icon={Sparkles}
            title="AI asks for a tool"
            body="The agent calls a named tool with a validated input schema."
          />
          <Step
            icon={Cable}
            title="Tool picks an adapter"
            body="The tool resolves the organization's connected provider for that category."
          />
          <Step
            icon={CalendarClock}
            title="Provider answers"
            body="Results return to the agent; nothing else in the app knows the vendor."
          />
        </div>
      </SectionCard>
    </div>
  );
}

function Step({ icon: Icon, title, body }) {
  return (
    <div className="rounded-xl border p-3.5">
      <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <p className="mt-2 text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}
