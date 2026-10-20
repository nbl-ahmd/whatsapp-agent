"use client";

import { useState } from "react";
import {
  Check,
  CircleAlert,
  Copy,
  KeyRound,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Webhook as WebhookIcon,
} from "lucide-react";
import { API_URL, api } from "@/lib/api";
import { useResource } from "@/lib/useResource";
import { formatRelative, titleCase } from "@/lib/format";
import {
  EmptyState,
  ErrorAlert,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

/**
 * Connection management. Credentials are write-only from the browser: the API
 * reports whether a secret is stored and never returns its value. Simulator
 * numbers let the whole loop run without Meta credentials.
 */

const EMPTY = {
  id: null,
  name: "",
  wabaId: "",
  phoneNumberId: "",
  displayPhoneNumber: "",
  verifiedName: "",
  providerMode: "meta",
  accessToken: "",
  appSecret: "",
  webhookVerifyToken: "",
};

const STATUS_TONE = { CONNECTED: "green", FLAGGED: "red", PENDING: "amber" };

function SecretBadge({ label, ok }) {
  return (
    <StatusBadge tone={ok ? "green" : "amber"}>
      {label} {ok ? "stored" : "missing"}
    </StatusBadge>
  );
}

export default function WhatsAppPage() {
  const numbers = useResource("/api/whatsapp/numbers");
  const accounts = useResource("/api/whatsapp/accounts");
  const webhook = useResource("/api/whatsapp/webhook-status");

  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const [test, setTest] = useState({ to: "", text: "Hello from the operator desk.", numberId: "" });
  const [testResult, setTestResult] = useState(null);

  const list = numbers.data?.phoneNumbers ?? [];
  const callbackUrl = `${API_URL}/api/webhooks/whatsapp`;
  const numberId = test.numberId || list[0]?.id || "";

  function refreshAll() {
    numbers.reload();
    accounts.reload();
    webhook.reload();
  }

  function startNew() {
    setForm(EMPTY);
    setOpen(true);
    setError(null);
    setNotice(null);
    setVerifyResult(null);
  }

  function startEdit(number) {
    setForm({
      id: number.id,
      name: number.account?.name ?? "",
      wabaId: number.account?.wabaId ?? "",
      phoneNumberId: number.phoneNumberId,
      displayPhoneNumber: number.displayPhoneNumber,
      verifiedName: number.verifiedName ?? "",
      providerMode: number.providerMode,
      accessToken: "",
      appSecret: "",
      webhookVerifyToken: "",
    });
    setOpen(true);
    setError(null);
    setNotice(null);
    setVerifyResult(null);
  }

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);

    const secrets = {};
    for (const key of ["accessToken", "appSecret", "webhookVerifyToken"]) {
      if (form[key]) secrets[key] = form[key];
    }

    try {
      if (form.id) {
        await api.patch(`/api/whatsapp/numbers/${form.id}`, {
          providerMode: form.providerMode,
          displayPhoneNumber: form.displayPhoneNumber,
          verifiedName: form.verifiedName || undefined,
          phoneNumberId: form.phoneNumberId,
          ...secrets,
        });
        setNotice("Connection updated.");
      } else {
        await api.post("/api/whatsapp/accounts", {
          name: form.name || form.verifiedName || "WhatsApp account",
          wabaId: form.wabaId || undefined,
          phoneNumberId: form.phoneNumberId,
          displayPhoneNumber: form.displayPhoneNumber,
          verifiedName: form.verifiedName || undefined,
          providerMode: form.providerMode,
          ...secrets,
        });
        setNotice("Number connected. Verify it to ask Meta about the token.");
        setForm(EMPTY);
      }
      refreshAll();
    } catch (caught) {
      setError(caught?.message ?? "Could not save the connection");
    } finally {
      setPending(false);
    }
  }

  async function verify(number) {
    setPending(true);
    setError(null);
    setVerifyResult(null);
    try {
      const result = await api.post(`/api/whatsapp/numbers/${number.id}/verify`);
      setVerifyResult(result);
      refreshAll();
    } catch (caught) {
      setError(caught?.message ?? "Verification failed");
    } finally {
      setPending(false);
    }
  }

  async function sendTest(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setTestResult(null);
    try {
      const number = list.find((row) => row.id === numberId);
      const result = await api.post("/api/whatsapp/messages", {
        to: test.to,
        text: test.text,
        ...(number ? { phoneNumberId: number.phoneNumberId } : {}),
      });
      setTestResult(result);
      numbers.reload();
    } catch (caught) {
      setError(caught?.message ?? "The message did not send");
    } finally {
      setPending(false);
    }
  }

  const anySimulator = list.some((number) => number.providerMode === "simulator");

  return (
    <div className="space-y-5">
      <PageHeader
        title="WhatsApp"
        description="Paste Meta test credentials here. They are encrypted at rest on the server and never returned to this page."
        actions={
          <>
            <Button variant="outline" onClick={refreshAll}>
              <RefreshCw />
              Refresh
            </Button>
            <Button onClick={startNew}>
              <Plus />
              Add number
            </Button>
          </>
        }
      />

      {anySimulator ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            At least one number is in <span className="font-semibold">simulator</span> mode.
            Outbound messages are recorded in the database instead of calling Meta, so the whole
            pipeline can be tested without tokens.
          </p>
        </div>
      ) : null}

      <ErrorAlert error={error || accounts.error} />

      {notice ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          <Check className="size-4" />
          {notice}
        </div>
      ) : null}

      {verifyResult ? (
        <div
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
            verifyResult.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
          }`}
        >
          {verifyResult.ok ? (
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
          )}
          <p>
            {verifyResult.ok ? (
              <>
                <span className="font-semibold">Verified.</span>{" "}
                {verifyResult.message ??
                  `Meta recognised ${verifyResult.number?.displayPhoneNumber}.`}
              </>
            ) : (
              <>
                <span className="font-semibold">Meta rejected the token.</span> {verifyResult.error}
              </>
            )}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        <div className="space-y-5">
          <SectionCard
            title="Connected numbers"
            description={`${list.length} ${list.length === 1 ? "number" : "numbers"}`}
          >
            {numbers.loading && list.length === 0 ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            ) : list.length === 0 ? (
              <EmptyState
                icon={MessageCircle}
                title="No number connected"
                description="Add a number in simulator mode to test the loop, or paste a Meta phone number id and access token."
                action={
                  <Button size="sm" onClick={startNew}>
                    <Plus />
                    Add number
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-3">
                {list.map((number) => (
                  <li key={number.id} className="rounded-xl border p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300">
                        <MessageCircle className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{number.displayPhoneNumber}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {number.verifiedName ?? "unnamed"} · id {number.phoneNumberId}
                          {number.qualityRating ? ` · quality ${number.qualityRating}` : ""}
                        </p>
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(number)}>
                          Edit
                        </Button>
                        <Button size="sm" disabled={pending} onClick={() => verify(number)}>
                          Verify
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <StatusBadge tone={number.providerMode === "simulator" ? "amber" : "indigo"}>
                        {number.providerMode}
                      </StatusBadge>
                      <StatusBadge tone={STATUS_TONE[number.status] ?? "amber"}>
                        {titleCase(number.status)}
                      </StatusBadge>
                      <SecretBadge label="token" ok={number.account?.hasAccessToken} />
                      <SecretBadge label="app secret" ok={number.account?.hasAppSecret} />
                      <SecretBadge label="verify token" ok={number.account?.hasVerifyToken} />
                      {number.account?.name ? (
                        <StatusBadge tone="zinc">{number.account.name}</StatusBadge>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {open ? (
            <SectionCard
              title={form.id ? "Edit connection" : "Add a number"}
              description="Secrets are write-only; leave a field blank to keep what is stored."
              action={
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Close
                </Button>
              }
            >
              <form className="space-y-4" onSubmit={submit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="wa-mode">Provider mode</Label>
                    <Select
                      value={form.providerMode}
                      onValueChange={(value) => setForm({ ...form, providerMode: value })}
                    >
                      <SelectTrigger id="wa-mode" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="meta">Meta Cloud API</SelectItem>
                        <SelectItem value="simulator">Simulator (no Meta calls)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wa-name">Account name</Label>
                    <Input
                      id="wa-name"
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      placeholder="Acme support"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wa-phone-number-id">Phone number id</Label>
                    <Input
                      id="wa-phone-number-id"
                      value={form.phoneNumberId}
                      onChange={(event) => setForm({ ...form, phoneNumberId: event.target.value })}
                      placeholder="100000000000001"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wa-display">Display number</Label>
                    <Input
                      id="wa-display"
                      value={form.displayPhoneNumber}
                      onChange={(event) =>
                        setForm({ ...form, displayPhoneNumber: event.target.value })
                      }
                      placeholder="+1 555 010 0001"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wa-verified">Verified name</Label>
                    <Input
                      id="wa-verified"
                      value={form.verifiedName}
                      onChange={(event) => setForm({ ...form, verifiedName: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wa-waba">WABA id</Label>
                    <Input
                      id="wa-waba"
                      value={form.wabaId}
                      onChange={(event) => setForm({ ...form, wabaId: event.target.value })}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 border-t pt-4 text-sm font-medium">
                  <KeyRound className="size-4 text-muted-foreground" />
                  Credentials
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="wa-token">Access token</Label>
                  <Input
                    id="wa-token"
                    type="password"
                    autoComplete="off"
                    value={form.accessToken}
                    onChange={(event) => setForm({ ...form, accessToken: event.target.value })}
                    placeholder={form.id ? "•••••••• (unchanged)" : "EAAG…"}
                  />
                  <p className="text-xs text-muted-foreground">
                    {form.id
                      ? "Leave blank to keep the stored token. Paste a new one to replace it."
                      : "Meta → WhatsApp → API setup. Stored encrypted; never shown again."}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="wa-secret">App secret</Label>
                    <Input
                      id="wa-secret"
                      type="password"
                      autoComplete="off"
                      value={form.appSecret}
                      onChange={(event) => setForm({ ...form, appSecret: event.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">Used to verify webhook signatures.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wa-verify-token">Webhook verify token</Label>
                    <Input
                      id="wa-verify-token"
                      type="password"
                      autoComplete="off"
                      value={form.webhookVerifyToken}
                      onChange={(event) =>
                        setForm({ ...form, webhookVerifyToken: event.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Must match the server&apos;s WHATSAPP_VERIFY_TOKEN.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={pending}>
                    {pending ? <Loader2 className="animate-spin" /> : null}
                    {form.id ? "Save connection" : "Connect number"}
                  </Button>
                </div>
              </form>
            </SectionCard>
          ) : null}
        </div>

        <div className="space-y-5">
          <SectionCard
            title="Webhook"
            description="Where Meta posts inbound events"
            action={<WebhookIcon className="size-4 text-muted-foreground" />}
          >
            {webhook.data ? (
              <div className="space-y-4">
                <dl className="space-y-2.5 text-sm">
                  <div className="flex flex-col gap-1">
                    <dt className="text-muted-foreground">Callback URL</dt>
                    <dd className="break-all rounded-lg border bg-muted/40 px-2.5 py-1.5 font-mono text-xs">
                      {callbackUrl}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Verify token (server)</dt>
                    <dd>
                      <SecretBadge label="" ok={webhook.data.verifyTokenConfigured} />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">App secret (server)</dt>
                    <dd>
                      <SecretBadge label="" ok={webhook.data.appSecretConfigured} />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Graph API version</dt>
                    <dd className="font-mono text-xs">{webhook.data.graphApiVersion}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Events (24 h)</dt>
                    <dd className="font-medium tabular-nums">{webhook.data.events24h}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Failed (24 h)</dt>
                    <dd>
                      {webhook.data.failed24h ? (
                        <StatusBadge tone="red">{webhook.data.failed24h}</StatusBadge>
                      ) : (
                        <StatusBadge tone="green">0</StatusBadge>
                      )}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Last event</dt>
                    <dd className="text-xs">
                      {webhook.data.lastEvent
                        ? formatRelative(webhook.data.lastEvent.receivedAt)
                        : "none yet"}
                    </dd>
                  </div>
                </dl>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(callbackUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch {
                      setCopied(false);
                    }
                  }}
                >
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy callback URL"}
                </Button>

                <p className="text-xs leading-5 text-muted-foreground">
                  In Meta → WhatsApp → Configuration, paste the callback URL, the verify token from
                  the server environment, and subscribe to the{" "}
                  <span className="font-medium text-foreground">messages</span> field.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            )}
          </SectionCard>

          <SectionCard title="Send a test message" description="Prove the outbound path end to end">
            <form className="space-y-4" onSubmit={sendTest}>
              <div className="space-y-1.5">
                <Label htmlFor="test-from">From number</Label>
                <Select
                  value={numberId}
                  onValueChange={(value) => setTest({ ...test, numberId: value })}
                >
                  <SelectTrigger id="test-from" className="w-full">
                    <SelectValue placeholder="No number" />
                  </SelectTrigger>
                  <SelectContent>
                    {list.map((number) => (
                      <SelectItem key={number.id} value={number.id}>
                        {number.displayPhoneNumber} · {number.providerMode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="test-to">Recipient</Label>
                <Input
                  id="test-to"
                  value={test.to}
                  onChange={(event) => setTest({ ...test, to: event.target.value })}
                  placeholder="+15550101"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  For a Meta test number, only approved recipients receive it.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="test-text">Text</Label>
                <Textarea
                  id="test-text"
                  value={test.text}
                  onChange={(event) => setTest({ ...test, text: event.target.value })}
                  required
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={pending || list.length === 0}>
                  <Send />
                  Send
                </Button>
              </div>
              {testResult ? (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <Check className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    <span className="font-semibold">Sent</span> · {testResult.message?.status} · id{" "}
                    {testResult.message?.externalMessageId ?? testResult.message?.id}
                  </span>
                </div>
              ) : null}
            </form>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
