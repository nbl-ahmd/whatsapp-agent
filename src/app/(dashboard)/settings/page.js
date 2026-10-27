"use client";

import { useState } from "react";
import { CheckCircle2, KeyRound, Loader2, Plus, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useResource } from "@/lib/useResource";
import { formatRelative, titleCase } from "@/lib/format";
import { useAuth } from "@/components/AuthProvider";
import {
  EmptyState,
  ErrorAlert,
  PageHeader,
  PersonAvatar,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WhatsAppSetup } from "@/components/whatsapp/WhatsAppSetup";

/**
 * Settings: the organization, the people in it, the operator's own password,
 * and the configuration only a server operator can change.
 */

const ROLES = ["OWNER", "ADMIN", "AGENT", "VIEWER"];
const AI_PROVIDERS = ["mock", "openai"];

function Notice({ tone, children }) {
  if (!children) return null;
  const good = tone === "ok";
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
        good
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
      }`}
    >
      {good ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
      {children}
    </div>
  );
}

function ConfigValue({ ok, children }) {
  return (
    <StatusBadge tone={ok ? "green" : "amber"}>
      {ok ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
      {children}
    </StatusBadge>
  );
}

function CredentialSource({ source }) {
  const tone = source === "settings" ? "green" : source === "env" ? "indigo" : "amber";
  return <StatusBadge tone={tone}>{source === "none" ? "not set" : source}</StatusBadge>;
}

/**
 * BYOK credentials. Secrets are write-only: a blank field keeps what is stored,
 * and the API only ever reports whether a value exists and where it came from.
 */
function CredentialsCard({ data, isAdmin, onSaved }) {
  const [draft, setDraft] = useState({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [testResult, setTestResult] = useState(null);

  function change(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function value(key, fallback = "") {
    return draft[key] ?? fallback ?? "";
  }

  async function save(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    setTestResult(null);

    const meta = {
      graphApiVersion: value("metaGraphApiVersion", data.meta.graphApiVersion),
      graphApiBaseUrl: value("metaGraphApiBaseUrl", data.meta.graphApiBaseUrl),
    };
    const ai = {
      provider: value("aiProvider", data.ai.provider),
      baseUrl: value("aiBaseUrl", data.ai.baseUrl),
      model: value("aiModel", data.ai.model),
    };

    for (const key of ["metaAccessToken", "metaAppSecret", "metaVerifyToken"]) {
      if (draft[key]) meta[key] = draft[key];
    }
    if (draft.aiApiKey) ai.apiKey = draft.aiApiKey;

    try {
      await api.patch("/api/settings", { meta, ai });
      setDraft({});
      setNotice("Credentials saved.");
      onSaved();
    } catch (caught) {
      setError(caught?.message ?? "Could not save credentials");
    } finally {
      setPending(false);
    }
  }

  async function clear(category, field, label) {
    setPending(true);
    setError(null);
    setNotice(null);
    setTestResult(null);
    try {
      await api.patch("/api/settings", { [category]: { [field]: "" } });
      setNotice(`${label} cleared.`);
      onSaved();
    } catch (caught) {
      setError(caught?.message ?? "Could not clear that credential");
    } finally {
      setPending(false);
    }
  }

  async function testAi() {
    setPending(true);
    setError(null);
    setNotice(null);
    setTestResult(null);
    try {
      const result = await api.post("/api/settings/test-ai");
      setTestResult(result);
    } catch (caught) {
      setError(caught?.message ?? "The AI provider rejected the request");
    } finally {
      setPending(false);
    }
  }

  const secretField = (id, label, hint, key, stored) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <div className="flex items-center gap-1.5">
          <CredentialSource source={stored ? "settings" : "none"} />
          {stored && isAdmin ? (
            <button
              type="button"
              className="text-xs font-medium text-muted-foreground underline underline-offset-2"
              disabled={pending}
              onClick={() => clear(id.startsWith("meta") ? "meta" : "ai", key, label)}
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
      <Input
        id={id}
        type="password"
        autoComplete="off"
        value={draft[id] ?? ""}
        onChange={(event) => change(id, event.target.value)}
        placeholder={stored ? "Stored — leave blank to keep" : "Paste a value"}
        disabled={!isAdmin}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <SectionCard
      title="API credentials"
      description="Bring your own keys. Stored encrypted in this organization; the server environment remains the fallback."
      action={<KeyRound className="size-4 text-muted-foreground" />}
    >
      <form className="space-y-5" onSubmit={save}>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">WhatsApp / Meta</h3>
              <CredentialSource
                source={
                  data.meta.source.accessToken === "settings" ||
                  data.meta.source.appSecret === "settings" ||
                  data.meta.source.verifyToken === "settings"
                    ? "settings"
                    : data.meta.source.accessToken === "env" ||
                        data.meta.source.appSecret === "env" ||
                        data.meta.source.verifyToken === "env"
                      ? "env"
                      : "none"
                }
              />
            </div>

            {secretField(
              "metaAccessToken",
              "Access token",
              "Used by numbers that do not store their own token. Meta → WhatsApp → API setup.",
              "accessToken",
              data.meta.stored.accessToken,
            )}
            {secretField(
              "metaAppSecret",
              "App secret",
              "Verifies the X-Hub-Signature-256 on every inbound webhook.",
              "appSecret",
              data.meta.stored.appSecret,
            )}
            {secretField(
              "metaVerifyToken",
              "Webhook verify token",
              "Paste the same value into Meta → WhatsApp → Configuration.",
              "verifyToken",
              data.meta.stored.verifyToken,
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="meta-version">Graph API version</Label>
                <Input
                  id="meta-version"
                  value={value("metaGraphApiVersion", data.meta.graphApiVersion)}
                  onChange={(event) => change("metaGraphApiVersion", event.target.value)}
                  placeholder="v21.0"
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meta-base">Graph API base URL</Label>
                <Input
                  id="meta-base"
                  value={value("metaGraphApiBaseUrl", data.meta.graphApiBaseUrl)}
                  onChange={(event) => change("metaGraphApiBaseUrl", event.target.value)}
                  placeholder="https://graph.facebook.com"
                  disabled={!isAdmin}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">AI provider</h3>
              <CredentialSource source={data.ai.source.apiKey} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ai-provider">Provider</Label>
              <Select
                value={value("aiProvider", data.ai.provider)}
                onValueChange={(next) => change("aiProvider", next)}
                disabled={!isAdmin}
              >
                <SelectTrigger id="ai-provider" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_PROVIDERS.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {provider === "mock" ? "Mock (no model call)" : "OpenAI-compatible"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {secretField(
              "aiApiKey",
              "API key",
              "Used for the OpenAI-compatible /chat/completions endpoint.",
              "apiKey",
              data.ai.stored.apiKey,
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ai-base">Base URL</Label>
                <Input
                  id="ai-base"
                  value={value("aiBaseUrl", data.ai.baseUrl)}
                  onChange={(event) => change("aiBaseUrl", event.target.value)}
                  placeholder="https://api.openai.com/v1"
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-model">Model</Label>
                <Input
                  id="ai-model"
                  value={value("aiModel", data.ai.model)}
                  onChange={(event) => change("aiModel", event.target.value)}
                  placeholder="gpt-4o-mini"
                  disabled={!isAdmin}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={testAi}>
                {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                Test AI
              </Button>
              {isAdmin ? (
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  Save credentials
                </Button>
              ) : null}
            </div>

            {testResult ? (
              <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs">
                <span className="font-semibold">{testResult.provider}</span> · {testResult.model} ·{" "}
                {testResult.text || "(empty reply)"}
              </p>
            ) : null}
          </div>
        </div>

        <Notice tone="bad">{error}</Notice>
        <Notice tone="ok">{notice}</Notice>

        <p className="text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">ENCRYPTION_KEY</span> stays server-side: it
          is what encrypts these values in the database. Everything else can be managed here.
        </p>
      </form>
    </SectionCard>
  );
}

export default function SettingsPage() {
  const { user, isAdmin, changePassword } = useAuth();
  const organization = useResource("/api/organizations");
  const team = useResource("/api/organizations/users");
  const ai = useResource("/api/ai-agents");
  const credentials = useResource("/api/settings");

  const [orgNameDraft, setOrgNameDraft] = useState(null);
  const [member, setMember] = useState({ name: "", email: "", password: "", role: "AGENT" });
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const orgName = orgNameDraft ?? organization.data?.organization?.name ?? "";

  async function saveOrg(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await api.patch("/api/organizations", { name: orgName });
      setNotice("Organization saved.");
      organization.reload();
    } catch (caught) {
      setError(caught?.message ?? "Could not save");
    } finally {
      setPending(false);
    }
  }

  async function addMember(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await api.post("/api/organizations/users", member);
      setMember({ name: "", email: "", password: "", role: "AGENT" });
      setNotice("Team member added.");
      team.reload();
    } catch (caught) {
      setError(caught?.message ?? "Could not add that member");
    } finally {
      setPending(false);
    }
  }

  async function updateMember(id, patch) {
    setPending(true);
    setError(null);
    try {
      await api.patch(`/api/organizations/users/${id}`, patch);
      team.reload();
    } catch (caught) {
      setError(caught?.message ?? "Could not update that member");
    } finally {
      setPending(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await changePassword(passwords.currentPassword, passwords.newPassword);
      setPasswords({ currentPassword: "", newPassword: "" });
      setNotice("Password changed.");
    } catch (caught) {
      setError(caught?.message ?? "Could not change the password");
    } finally {
      setPending(false);
    }
  }

  const provider = credentials.data?.ai.provider ?? ai.data?.provider ?? "mock";
  const members = team.data?.members ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Organization, team and the configuration the server owns. Browser sessions never see a Meta or AI secret."
      />

      <Notice tone="bad">{error}</Notice>
      <Notice tone="ok">{notice}</Notice>

      {credentials.data ? (
        <WhatsAppSetup
          credentials={credentials.data}
          isAdmin={isAdmin}
          onSaved={() => {
            credentials.reload();
            ai.reload();
          }}
        />
      ) : (
        <SectionCard title="WhatsApp connection" description="Loading stored configuration">
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </div>
        </SectionCard>
      )}

      {credentials.data ? (
        <CredentialsCard
          data={credentials.data}
          isAdmin={isAdmin}
          onSaved={() => {
            credentials.reload();
            ai.reload();
          }}
        />
      ) : null}

      <ErrorAlert error={credentials.error} />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <SectionCard title="Organization" description="How your desk is identified">
            {!organization.data ? (
              <div className="space-y-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : (
              <form className="space-y-4" onSubmit={saveOrg}>
                <div className="space-y-1.5">
                  <Label htmlFor="org-name">Name</Label>
                  <Input
                    id="org-name"
                    value={orgName}
                    onChange={(event) => setOrgNameDraft(event.target.value)}
                    disabled={!isAdmin}
                  />
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Slug</dt>
                    <dd className="font-mono text-xs">{organization.data.organization.slug}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Plan</dt>
                    <dd className="font-medium">{titleCase(organization.data.organization.plan)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Your role</dt>
                    <dd>
                      <StatusBadge tone="indigo">
                        <ShieldCheck className="size-3" />
                        {titleCase(user?.role ?? "agent")}
                      </StatusBadge>
                    </dd>
                  </div>
                </dl>
                {isAdmin ? (
                  <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={pending}>
                      {pending ? <Loader2 className="animate-spin" /> : null}
                      Save
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Only owners and admins can rename the organization.
                  </p>
                )}
              </form>
            )}
          </SectionCard>

          <SectionCard title="Your password" description="Use at least 8 characters">
            <form className="space-y-4" onSubmit={savePassword}>
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={passwords.currentPassword}
                  onChange={(event) =>
                    setPasswords({ ...passwords, currentPassword: event.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={passwords.newPassword}
                  onChange={(event) =>
                    setPasswords({ ...passwords, newPassword: event.target.value })
                  }
                  required
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={pending}>
                  Change password
                </Button>
              </div>
            </form>
          </SectionCard>

          <SectionCard
            title="Effective configuration"
            description="What the backend will actually use, after settings and env fallbacks"
          >
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">AI provider</dt>
                <dd>
                  <StatusBadge tone={provider === "mock" ? "amber" : "green"}>{provider}</StatusBadge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">AI API key</dt>
                <dd>
                  <CredentialSource source={credentials.data?.ai.source.apiKey ?? "none"} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Webhook verify token</dt>
                <dd>
                  <CredentialSource source={credentials.data?.meta.source.verifyToken ?? "none"} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Meta app secret</dt>
                <dd>
                  <CredentialSource source={credentials.data?.meta.source.appSecret ?? "none"} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Access token</dt>
                <dd>
                  <CredentialSource source={credentials.data?.meta.source.accessToken ?? "none"} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Encryption key</dt>
                <dd>
                  <ConfigValue ok={credentials.data?.server.encryptionKeyConfigured}>
                    {credentials.data?.server.encryptionKeyConfigured ? "configured" : "missing"}
                  </ConfigValue>
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Values saved above win over <span className="font-mono">server/.env</span>. A number
              can still carry its own token on the WhatsApp page, which wins over both.
            </p>
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard
            title="Team"
            description={`${members.length} ${members.length === 1 ? "person" : "people"}`}
            contentClassName="px-0"
          >
            {team.loading && members.length === 0 ? (
              <div className="space-y-3 px-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : members.length === 0 ? (
              <div className="px-4">
                <EmptyState title="No team members" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Threads</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Last login</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <PersonAvatar name={entry.name} className="size-8" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{entry.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{entry.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {isAdmin && entry.id !== user?.id ? (
                          <Select
                            value={entry.role}
                            onValueChange={(value) => updateMember(entry.id, { role: value })}
                          >
                            <SelectTrigger size="sm" className="w-[110px]" aria-label={`Role for ${entry.name}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {role}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <StatusBadge tone="zinc">{entry.role}</StatusBadge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {entry._count?.conversations ?? 0}
                      </TableCell>
                      <TableCell className="hidden text-right text-xs text-muted-foreground sm:table-cell">
                        {entry.lastLoginAt ? formatRelative(entry.lastLoginAt) : "never"}
                      </TableCell>
                      <TableCell className="text-right">
                        {isAdmin && entry.id !== user?.id ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            onClick={() => updateMember(entry.id, { isActive: !entry.isActive })}
                          >
                            {entry.isActive ? "Disable" : "Enable"}
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>

          {isAdmin ? (
            <SectionCard title="Add a team member" description="They sign in with the temporary password">
              <form className="space-y-4" onSubmit={addMember}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="member-name">Name</Label>
                    <Input
                      id="member-name"
                      value={member.name}
                      onChange={(event) => setMember({ ...member, name: event.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="member-role">Role</Label>
                    <Select
                      value={member.role}
                      onValueChange={(value) => setMember({ ...member, role: value })}
                    >
                      <SelectTrigger id="member-role" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="member-email">Email</Label>
                  <Input
                    id="member-email"
                    type="email"
                    value={member.email}
                    onChange={(event) => setMember({ ...member, email: event.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="member-password">Temporary password</Label>
                  <Input
                    id="member-password"
                    type="password"
                    minLength={8}
                    value={member.password}
                    onChange={(event) => setMember({ ...member, password: event.target.value })}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Share it out of band; they can change it here.
                  </p>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={pending}>
                    <Plus />
                    Add member
                  </Button>
                </div>
              </form>
            </SectionCard>
          ) : null}

          <ErrorAlert error={team.error || organization.error} />
        </div>
      </div>
    </div>
  );
}
