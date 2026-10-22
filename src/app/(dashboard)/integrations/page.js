"use client";

import { useState } from "react";
import {
  Boxes,
  Cable,
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { useResource } from "@/lib/useResource";
import { formatRelative, titleCase } from "@/lib/format";
import { useAuth } from "@/components/AuthProvider";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Integrations: connect a CRM/ecommerce provider; the AI only ever sees the
 * generic tools. Credentials are write-only and encrypted at rest.
 */

const CATALOG = [
  {
    category: "crm",
    name: "CRM",
    icon: Users,
    providers: "HubSpot",
    summary: "Read and write customer records, notes and leads.",
    methods: ["findCustomer", "createCustomer", "updateCustomer", "addNote", "createLead"],
  },
  {
    category: "ecommerce",
    name: "Ecommerce",
    icon: ShoppingCart,
    providers: "Shopify",
    summary: "Products, orders and cancellations, answered from the store.",
    methods: ["searchProducts", "getProduct", "getOrder", "listOrders", "createOrder", "cancelOrder"],
  },
  {
    category: "mcp",
    name: "MCP tools",
    icon: Boxes,
    providers: "Phase 8",
    summary: "Bring external tool servers in behind the same tool abstraction.",
    methods: ["listTools", "callTool"],
  },
];

const STATUS_TONE = { active: "green", inactive: "zinc", error: "red" };
const ADMIN_ROLES = ["OWNER", "ADMIN"];

export default function IntegrationsPage() {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role);
  const integrations = useResource("/api/integrations");

  const [notice, setNotice] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const rows = integrations.data?.integrations ?? [];
  const providers = integrations.data?.providers ?? [];

  async function testConnection(row) {
    setBusyId(row.id);
    setNotice(null);
    setActionError(null);
    try {
      const result = await api.post(`/api/integrations/${row.id}/test`);
      setNotice(
        `${row.providerLabel} responded${result?.detail?.shop ? ` (${result.detail.shop})` : ""}. Connection is healthy.`,
      );
      integrations.reload();
    } catch (error) {
      setActionError(error);
    } finally {
      setBusyId(null);
    }
  }

  async function removeConnection(row) {
    if (!window.confirm(`Disconnect ${row.name}? Stored credentials will be deleted.`)) return;

    setBusyId(row.id);
    setNotice(null);
    setActionError(null);
    try {
      await api.del(`/api/integrations/${row.id}`);
      setNotice(`${row.name} disconnected.`);
      integrations.reload();
    } catch (error) {
      setActionError(error);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Integrations"
        description="Connect the CRM and store the AI may use. Credentials are encrypted and never exposed to the browser."
        actions={
          <Button variant="outline" onClick={integrations.reload}>
            <RefreshCw />
            Refresh
          </Button>
        }
      />

      <ErrorAlert error={integrations.error ?? actionError} />
      {notice ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          <CheckCircle2 className="size-4" />
          {notice}
        </div>
      ) : null}

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
            description="Connect a provider below. The AI keeps working without one; CRM and order tools only become available after a connection exists."
          />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <li key={row.id}>
                <Card className="h-full gap-3 py-4">
                  <CardContent className="flex h-full flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                          <Cable className="size-4" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold">{row.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.providerLabel}
                            {row.config?.shopDomain ? ` · ${row.config.shopDomain}` : ""}
                          </p>
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

                    {isAdmin ? (
                      <div className="mt-auto flex gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === row.id}
                          onClick={() => testConnection(row)}
                        >
                          {busyId === row.id ? <Loader2 className="animate-spin" /> : null}
                          Test
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyId === row.id}
                          onClick={() => removeConnection(row)}
                        >
                          <Trash2 />
                          Remove
                        </Button>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Connect a provider"
        description="Secrets are encrypted at rest and only ever sent from the server to the provider."
      >
        {!isAdmin ? (
          <p className="text-sm text-muted-foreground">
            Only owners and admins can add or change integrations.
          </p>
        ) : providers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No providers are registered on this server.</p>
        ) : (
          <ConnectForm
            providers={providers}
            onSaved={(message) => {
              setNotice(message);
              setActionError(null);
              integrations.reload();
            }}
            onError={(error) => {
              setActionError(error);
              setNotice(null);
            }}
          />
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
                        {entry.providers}
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

function ConnectForm({ providers, onSaved, onError }) {
  const [providerKey, setProviderKey] = useState("");
  const [name, setName] = useState("");
  const [values, setValues] = useState({});
  const [pending, setPending] = useState(false);

  const selected = providers.find((entry) => `${entry.category}:${entry.provider}` === providerKey);

  function chooseProvider(value) {
    setProviderKey(value);
    const provider = providers.find((entry) => `${entry.category}:${entry.provider}` === value);
    setName(provider?.label ?? "");
    setValues({});
  }

  function change(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!selected) return;

    setPending(true);
    try {
      await api.post("/api/integrations", {
        category: selected.category,
        provider: selected.provider,
        name: name || selected.label,
        fields: values,
      });
      setProviderKey("");
      setName("");
      setValues({});
      onSaved(`${selected.label} connected.`);
    } catch (error) {
      onError(error);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Provider</Label>
          <Select value={providerKey} onValueChange={chooseProvider}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a provider" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((entry) => (
                <SelectItem key={`${entry.category}:${entry.provider}`} value={`${entry.category}:${entry.provider}`}>
                  {entry.label} · {entry.category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selected ? <p className="text-xs text-muted-foreground">{selected.description}</p> : null}
        </div>

        {selected ? (
          <div className="space-y-2">
            <Label htmlFor="integration-name">Connection name</Label>
            <Input
              id="integration-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={selected.label}
              maxLength={120}
            />
            <p className="text-xs text-muted-foreground">
              Used on this page only; the AI tool does not depend on it.
            </p>
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="grid gap-4 md:grid-cols-2">
          {selected.fields.map((field) => (
            <div key={field.name} className="space-y-2">
              <Label htmlFor={`field-${field.name}`}>
                {field.label}
                {field.required ? <span className="text-destructive"> *</span> : null}
              </Label>
              <Input
                id={`field-${field.name}`}
                type={field.type === "password" ? "password" : field.type === "url" ? "url" : "text"}
                value={values[field.name] ?? ""}
                onChange={(event) => change(field.name, event.target.value)}
                placeholder={field.placeholder ?? ""}
                required={field.required}
                autoComplete={field.secret ? "new-password" : "off"}
              />
              {field.hint ? <p className="text-xs text-muted-foreground">{field.hint}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      <Button type="submit" disabled={!selected || pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Plus />}
        Connect
      </Button>
    </form>
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
