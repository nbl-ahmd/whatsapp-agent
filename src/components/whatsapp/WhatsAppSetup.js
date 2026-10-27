"use client";

import { useState } from "react";
import {
  Activity,
  Check,
  CheckCircle2,
  CircleAlert,
  Copy,
  Info,
  Loader2,
  MessageCircle,
  PlugZap,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Webhook,
  XCircle,
} from "lucide-react";
import { API_URL, api } from "@/lib/api";
import { useResource } from "@/lib/useResource";
import { formatRelative, titleCase } from "@/lib/format";
import { EmptyState, ErrorAlert, SectionCard, StatusBadge } from "@/components/ui";
import { Button } from "@/components/ui/button";
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

const CHECK_TONE = { ok: "green", warning: "amber", error: "red", info: "zinc" };

function CheckIcon({ status }) {
  if (status === "ok") return <CheckCircle2 className="size-4 text-emerald-600" />;
  if (status === "warning") return <CircleAlert className="size-4 text-amber-600" />;
  if (status === "error") return <XCircle className="size-4 text-rose-600" />;
  return <Info className="size-4 text-muted-foreground" />;
}

function CheckList({ checks }) {
  if (!checks?.length) return null;
  return (
    <ul className="space-y-2">
      {checks.map((entry) => (
        <li key={entry.id} className="flex items-start gap-2 rounded-lg border px-3 py-2">
          <span className="mt-0.5">
            <CheckIcon status={entry.status} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm font-medium">{entry.label}</p>
              <StatusBadge tone={CHECK_TONE[entry.status] ?? "zinc"}>
                {entry.status}
              </StatusBadge>
            </div>
            {entry.detail ? (
              <p className="mt-0.5 break-words text-xs text-muted-foreground">{entry.detail}</p>
            ) : null}
            {entry.fix ? (
              <p className="mt-1 text-xs text-foreground/80">{entry.fix}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function SecretBadge({ label, ok }) {
  return (
    <StatusBadge tone={ok ? "green" : "amber"}>
      {label} {ok ? "stored" : "missing"}
    </StatusBadge>
  );
}

function credentialsFor(credentials, key) {
  return credentials?.meta?.stored?.[key] ?? false;
}

/**
 * Everything needed to put a Meta test number on the air: credentials status,
 * discovery/connection, webhook subscription, diagnostics and the setup guide.
 * Secrets are write-only; the browser only sees "stored" flags.
 */
export function WhatsAppSetup({ credentials, isAdmin, onSaved }) {
  const numbers = useResource("/api/whatsapp/numbers");
  const webhook = useResource("/api/whatsapp/webhook-status");

  const [form, setForm] = useState({ wabaId: "", phoneNumberId: "", accessToken: "" });
  const [discovery, setDiscovery] = useState(null);
  const [simulator, setSimulator] = useState({ name: "Local simulator", displayPhoneNumber: "" });
  const [selectedNumberId, setSelectedNumberId] = useState("");

  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const [handshake, setHandshake] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [copied, setCopied] = useState(false);

  const list = numbers.data?.phoneNumbers ?? [];
  const defaultNumber = list.find((number) => number.providerMode !== "simulator") ?? list[0] ?? null;
  const selectedNumber =
    list.find((number) => number.id === selectedNumberId) ?? defaultNumber;
  const selectedWabaId = selectedNumber?.account?.wabaId ?? null;
  const callbackUrl =
    webhook.data?.callbackUrl ?? `${API_URL}/api/webhooks/whatsapp`;
  const tokenStored = credentialsFor(credentials, "accessToken");
  const appSecretStored = credentialsFor(credentials, "appSecret");
  const verifyTokenStored = credentialsFor(credentials, "verifyToken");

  function refresh() {
    numbers.reload();
    webhook.reload();
  }

  function clearMessages() {
    setError(null);
    setNotice(null);
    setVerifyResult(null);
  }

  async function copyCallback() {
    try {
      await navigator.clipboard.writeText(callbackUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  async function findNumbers(event) {
    event.preventDefault();
    clearMessages();
    setDiscovery(null);
    setBusy("discover");
    try {
      const result = await api.post("/api/whatsapp/meta/discover", {
        wabaId: form.wabaId.trim() || undefined,
        phoneNumberId: form.phoneNumberId.trim() || undefined,
        accessToken: form.accessToken.trim() || undefined,
      });
      setDiscovery(result);
      if (result.phoneNumbers.length === 0) {
        setError({
          message:
            "Meta returned no phone numbers for that WABA. Check the WABA id in Meta → WhatsApp → API Setup.",
        });
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function connectNumber(phoneNumber) {
    clearMessages();
    setBusy(`connect:${phoneNumber.phoneNumberId}`);
    const wabaId = discovery?.waba?.id ?? form.wabaId.trim();
    try {
      await api.post("/api/whatsapp/meta/connect", {
        wabaId,
        phoneNumberId: phoneNumber.phoneNumberId,
        accessToken: form.accessToken.trim() || undefined,
      });
      setNotice(
        `${phoneNumber.displayPhoneNumber ?? "The number"} connected. Send it a WhatsApp message to test inbound.`,
      );
      setForm((current) => ({ ...current, accessToken: "" }));
      setDiscovery(null);
      refresh();
      onSaved?.();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function verifyNumber(number) {
    clearMessages();
    setBusy(`verify:${number.id}`);
    try {
      const result = await api.post(`/api/whatsapp/numbers/${number.id}/verify`);
      setVerifyResult(result);
      refresh();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function removeNumber(number) {
    if (!window.confirm(`Disconnect ${number.displayPhoneNumber}? Stored messages stay in the database.`)) {
      return;
    }
    clearMessages();
    setBusy(`remove:${number.id}`);
    try {
      await api.del(`/api/whatsapp/numbers/${number.id}`);
      setNotice(`${number.displayPhoneNumber} disconnected.`);
      refresh();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function addSimulator(event) {
    event.preventDefault();
    clearMessages();
    setBusy("simulator");
    const random =
      globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      await api.post("/api/whatsapp/accounts", {
        name: simulator.name || "Local simulator",
        phoneNumberId: `sim_${random}`,
        displayPhoneNumber: simulator.displayPhoneNumber || "+10000000000",
        providerMode: "simulator",
      });
      setNotice("Simulator number added. It can send and receive without Meta.");
      setSimulator({ name: "Local simulator", displayPhoneNumber: "" });
      refresh();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function runDiagnostics() {
    clearMessages();
    setBusy("diagnostics");
    setDiagnostics(null);
    try {
      const result = await api.post("/api/whatsapp/diagnostics", {
        phoneNumberId: selectedNumber?.id,
      });
      setDiagnostics(result);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function testHandshake() {
    clearMessages();
    setBusy("handshake");
    setHandshake(null);
    try {
      const result = await api.post("/api/whatsapp/webhook-test");
      setHandshake(result);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function subscribeApp() {
    clearMessages();
    setBusy("subscribe");
    setSubscription(null);
    try {
      const result = await api.post("/api/whatsapp/webhook/subscribe", {
        phoneNumberId: selectedNumber?.id,
      });
      setSubscription(result);
      setNotice(
        result.ok
          ? "App subscribed to the WABA. Meta will now deliver webhook events here."
          : "Meta did not confirm the subscription. Check the diagnostics.",
      );
      refresh();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  const numberFormDisabled = !isAdmin;

  return (
    <div className="space-y-5">
      <ErrorAlert error={error || numbers.error || webhook.error} />
      {notice ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          <Check className="size-4" />
          {notice}
        </div>
      ) : null}

      <SectionCard
        title="Connect a WhatsApp number"
        description="Paste the test-number credentials from Meta, find the number, and connect it. The access token is saved to this organization."
        action={<PlugZap className="size-4 text-muted-foreground" />}
      >
        <div className="mb-4 flex flex-wrap gap-1.5">
          <SecretBadge label="access token" ok={tokenStored} />
          <SecretBadge label="app secret" ok={appSecretStored} />
          <SecretBadge label="verify token" ok={verifyTokenStored} />
          <StatusBadge tone={credentials?.meta?.source?.accessToken === "env" ? "indigo" : "zinc"}>
            token source: {credentials?.meta?.source?.accessToken ?? "none"}
          </StatusBadge>
        </div>

        <form className="space-y-4" onSubmit={findNumbers}>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="connect-waba">WABA id</Label>
              <Input
                id="connect-waba"
                value={form.wabaId}
                onChange={(event) => setForm({ ...form, wabaId: event.target.value })}
                placeholder="WhatsApp Business Account id"
                disabled={numberFormDisabled}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Meta → WhatsApp → API Setup → WhatsApp Business Account ID.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="connect-token">Access token</Label>
              <Input
                id="connect-token"
                type="password"
                autoComplete="off"
                value={form.accessToken}
                onChange={(event) => setForm({ ...form, accessToken: event.target.value })}
                placeholder={tokenStored ? "Stored — leave blank to use it" : "EAAG…"}
                disabled={numberFormDisabled}
              />
              <p className="text-xs text-muted-foreground">
                Temporary tokens expire in 24 hours. A saved token is used as the fallback.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="connect-phone">Phone number id (optional)</Label>
              <Input
                id="connect-phone"
                value={form.phoneNumberId}
                onChange={(event) => setForm({ ...form, phoneNumberId: event.target.value })}
                placeholder="Use when you only have the number id"
                disabled={numberFormDisabled}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                WABA discovery is preferred; this fetches a single number.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={numberFormDisabled || busy === "discover"}
            >
              {busy === "discover" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Find numbers
            </Button>
            <span className="text-xs text-muted-foreground">
              The token is only stored after a successful connect.
            </span>
          </div>
        </form>

        {discovery ? (
          <div className="mt-4 space-y-3 border-t pt-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm font-medium">
                {discovery.waba?.name ?? "Discovered number"}
              </p>
              {discovery.waba?.id ? (
                <StatusBadge tone="zinc">WABA {discovery.waba.id}</StatusBadge>
              ) : null}
              <StatusBadge tone="indigo">token: {discovery.tokenSource}</StatusBadge>
            </div>
            {discovery.phoneNumbers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Meta returned no numbers for this WABA.
              </p>
            ) : (
              <ul className="space-y-2">
                {discovery.phoneNumbers.map((number) => {
                  const connected = (discovery.connectedPhoneNumberIds ?? []).includes(
                    number.phoneNumberId,
                  );
                  return (
                    <li
                      key={number.phoneNumberId}
                      className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5"
                    >
                      <span className="grid size-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300">
                        <MessageCircle className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {number.displayPhoneNumber ?? number.phoneNumberId}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {number.verifiedName ?? "unnamed"} · {number.phoneNumberId}
                          {number.qualityRating ? ` · quality ${number.qualityRating}` : ""}
                        </p>
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        {connected ? <StatusBadge tone="green">connected</StatusBadge> : null}
                        <Button
                          type="button"
                          size="sm"
                          disabled={
                            numberFormDisabled ||
                            !form.wabaId.trim() && !discovery.waba?.id ||
                            busy === `connect:${number.phoneNumberId}`
                          }
                          onClick={() => connectNumber(number)}
                        >
                          {busy === `connect:${number.phoneNumberId}` ? (
                            <Loader2 className="animate-spin" />
                          ) : connected ? (
                            <RefreshCw />
                          ) : (
                            <Plus />
                          )}
                          {connected ? "Reconnect" : "Connect"}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        <details className="mt-4 rounded-lg border bg-muted/20 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">
            Add a simulator number (no Meta credentials)
          </summary>
          <form className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end" onSubmit={addSimulator}>
            <div className="space-y-1.5">
              <Label htmlFor="sim-name">Name</Label>
              <Input
                id="sim-name"
                value={simulator.name}
                onChange={(event) => setSimulator({ ...simulator, name: event.target.value })}
                disabled={numberFormDisabled}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sim-display">Display number</Label>
              <Input
                id="sim-display"
                value={simulator.displayPhoneNumber}
                onChange={(event) =>
                  setSimulator({ ...simulator, displayPhoneNumber: event.target.value })
                }
                placeholder="+10000000000"
                disabled={numberFormDisabled}
              />
            </div>
            <Button type="submit" size="sm" variant="outline" disabled={numberFormDisabled || busy === "simulator"}>
              {busy === "simulator" ? <Loader2 className="animate-spin" /> : <Plus />}
              Add simulator
            </Button>
          </form>
        </details>
      </SectionCard>

      <SectionCard
        title="Connected numbers"
        description={`${list.length} ${list.length === 1 ? "number" : "numbers"} in this organization`}
        action={
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw />
            Refresh
          </Button>
        }
      >
        {verifyResult ? (
          <div
            className={`mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
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
                  {verifyResult.message ?? "Meta recognised the token and number."}
                </>
              ) : (
                <>
                  <span className="font-semibold">Meta rejected the token.</span>{" "}
                  {verifyResult.error}
                </>
              )}
            </p>
          </div>
        ) : null}

        {numbers.loading && list.length === 0 ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="No number connected"
            description="Find your Meta test number above, or add a simulator number to test locally."
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
                      {number.verifiedName ?? "unnamed"} · {number.account?.name ?? "no account"}
                      {number.account?.wabaId ? ` · WABA ${number.account.wabaId}` : ""}
                    </p>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy === `verify:${number.id}`}
                      onClick={() => verifyNumber(number)}
                    >
                      {busy === `verify:${number.id}` ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <ShieldCheck />
                      )}
                      Verify
                    </Button>
                    {isAdmin ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-600 hover:text-rose-700 dark:text-rose-300"
                        disabled={busy === `remove:${number.id}`}
                        onClick={() => removeNumber(number)}
                      >
                        {busy === `remove:${number.id}` ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Trash2 />
                        )}
                        Disconnect
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <StatusBadge tone={number.providerMode === "simulator" ? "amber" : "indigo"}>
                    {number.providerMode}
                  </StatusBadge>
                  <StatusBadge
                    tone={
                      number.status === "CONNECTED"
                        ? "green"
                        : number.status === "FLAGGED"
                          ? "red"
                          : "amber"
                    }
                  >
                    {titleCase(number.status)}
                  </StatusBadge>
                  <SecretBadge label="number token" ok={number.account?.hasAccessToken} />
                  <SecretBadge label="org token" ok={tokenStored} />
                  <SecretBadge label="app secret" ok={appSecretStored} />
                  <SecretBadge label="verify token" ok={verifyTokenStored} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,1fr)]">
        <SectionCard
          title="Webhook"
          description="The public URL Meta calls for inbound messages and delivery statuses"
          action={<Webhook className="size-4 text-muted-foreground" />}
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">Callback URL</p>
              <div className="break-all rounded-lg border bg-muted/40 px-2.5 py-1.5 font-mono text-xs">
                {callbackUrl}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={copyCallback}>
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied" : "Copy callback URL"}
              </Button>
            </div>

            <dl className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Verify token</dt>
                <dd>
                  <CredentialFlag
                    ok={webhook.data?.verifyTokenConfigured ?? verifyTokenStored}
                    source={webhook.data?.credentialSource?.verifyToken}
                  />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">App secret</dt>
                <dd>
                  <CredentialFlag
                    ok={webhook.data?.appSecretConfigured ?? appSecretStored}
                    source={webhook.data?.credentialSource?.appSecret}
                  />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Access token</dt>
                <dd>
                  <CredentialFlag
                    ok={webhook.data?.accessTokenConfigured ?? tokenStored}
                    source={webhook.data?.credentialSource?.accessToken}
                  />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Events (24 h)</dt>
                <dd className="font-medium tabular-nums">{webhook.data?.events24h ?? 0}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Failed (24 h)</dt>
                <dd>
                  {webhook.data?.failed24h ? (
                    <StatusBadge tone="red">{webhook.data.failed24h}</StatusBadge>
                  ) : (
                    <StatusBadge tone="green">0</StatusBadge>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Last event</dt>
                <dd className="text-xs">
                  {webhook.data?.lastEvent
                    ? formatRelative(webhook.data.lastEvent.receivedAt)
                    : "none yet"}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy === "handshake" || !isAdmin}
                onClick={testHandshake}
              >
                {busy === "handshake" ? <Loader2 className="animate-spin" /> : <Activity />}
                Test handshake
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy === "subscribe" || !isAdmin || !selectedWabaId}
                onClick={subscribeApp}
              >
                {busy === "subscribe" ? <Loader2 className="animate-spin" /> : <PlugZap />}
                Subscribe app
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy === "diagnostics" || !isAdmin}
                onClick={runDiagnostics}
              >
                {busy === "diagnostics" ? <Loader2 className="animate-spin" /> : <Activity />}
                Run diagnostics
              </Button>
            </div>

            {!selectedWabaId ? (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                Connect a Meta number (not a simulator) to subscribe the app or list templates.
              </p>
            ) : null}

            {list.length > 1 ? (
              <div className="space-y-1.5">
                <Label htmlFor="diagnostics-number">Number for webhook actions</Label>
                <Select
                  value={selectedNumber?.id ?? ""}
                  onValueChange={setSelectedNumberId}
                >
                  <SelectTrigger id="diagnostics-number" className="w-full">
                    <SelectValue placeholder="No number" />
                  </SelectTrigger>
                  <SelectContent>
                    {list.map((number) => (
                      <SelectItem key={number.id} value={number.id}>
                        {number.displayPhoneNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {handshake ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Handshake</p>
                <CheckList checks={handshake.checks} />
              </div>
            ) : null}

            {subscription ? (
              <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs">
                {subscription.ok
                  ? `Subscribed to WABA ${subscription.wabaId}.`
                  : "Meta did not confirm the subscription."}
              </p>
            ) : null}

            {diagnostics ? (
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">Diagnostics</p>
                  <StatusBadge tone={diagnostics.ok ? "green" : "red"}>
                    {diagnostics.ok ? "ready" : "needs attention"}
                  </StatusBadge>
                </div>
                <CheckList checks={diagnostics.checks} />
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard
          title="Meta test number checklist"
          description="The short version. The full runbook is in docs/WHATSAPP_SETUP.md."
          action={<Info className="size-4 text-muted-foreground" />}
        >
          <ol className="space-y-3 text-sm">
            {[
              "Create a Meta app at developers.facebook.com/apps and add the WhatsApp product.",
              "Open WhatsApp → API Setup. Copy the test phone number id, WABA id and temporary access token.",
              "Add your own WhatsApp number as a recipient in API Setup (up to 5 test recipients).",
              "Save the access token, app secret and a verify token in Settings → API credentials.",
              "Paste the WABA id above, press Find numbers, then Connect.",
              "Expose this API over HTTPS, paste the callback URL in Meta → Configuration, and subscribe to messages.",
              "Press Subscribe app here, then Run diagnostics and Test handshake.",
              "Send a WhatsApp message to the test number; it should appear in the Inbox.",
            ].map((step, index) => (
              <li key={step} className="flex gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                  {index + 1}
                </span>
                <span className="text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-lg border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
            Meta requires a public HTTPS callback URL. Locally, run{" "}
            <code className="font-mono">cloudflared tunnel --url http://localhost:4000</code>{" "}
            and use the tunnel URL plus <code className="font-mono">/api/webhooks/whatsapp</code>.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}

function CredentialFlag({ ok, source }) {
  return (
    <StatusBadge tone={ok ? "green" : "amber"}>
      {ok ? "configured" : "missing"}
      {source && source !== "none" ? ` · ${source}` : ""}
    </StatusBadge>
  );
}
