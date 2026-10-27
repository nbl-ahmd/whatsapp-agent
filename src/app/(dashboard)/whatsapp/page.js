"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Check,
  CircleAlert,
  Copy,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  Settings,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { FlowsPanel } from "@/components/whatsapp/FlowsPanel";
import { TemplatesPanel } from "@/components/whatsapp/TemplatesPanel";

/**
 * Connection management. Credentials are write-only from the browser: the API
 * reports whether a secret is stored and never returns its value. Simulator
 * numbers let the whole loop run without Meta credentials.
 */

function SecretBadge({ label, ok }) {
  return (
    <StatusBadge tone={ok ? "green" : "amber"}>
      {label} {ok ? "stored" : "missing"}
    </StatusBadge>
  );
}

export default function WhatsAppPage() {
  const numbers = useResource("/api/whatsapp/numbers");
  const webhook = useResource("/api/whatsapp/webhook-status");

  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("connection");

  const [test, setTest] = useState({
    to: "",
    text: "Hello from the operator desk.",
    numberId: "",
    type: "text",
    mediaLink: "",
    filename: "",
    templateName: "",
    templateLanguage: "en_US",
    components: "",
  });
  const [testResult, setTestResult] = useState(null);
  const [inbound, setInbound] = useState({
    from: "15550001111",
    text: "Hello from a simulated customer.",
  });
  const [inboundResult, setInboundResult] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templatesFor, setTemplatesFor] = useState(null);
  const [templatesPending, setTemplatesPending] = useState(false);
  const [templatesError, setTemplatesError] = useState(null);

  const list = numbers.data?.phoneNumbers ?? [];
  const callbackUrl = webhook.data?.callbackUrl ?? `${API_URL}/api/webhooks/whatsapp`;
  const numberId = test.numberId || list[0]?.id || "";
  const selectedNumber = list.find((row) => row.id === numberId) ?? null;
  const templatesLoaded =
    Boolean(templatesFor) && templatesFor === selectedNumber?.phoneNumberId;

  async function loadTemplates() {
    if (!selectedNumber) return;
    setTemplatesPending(true);
    setTemplatesError(null);
    try {
      const result = await api.get(
        `/api/whatsapp/templates?phoneNumberId=${encodeURIComponent(selectedNumber.phoneNumberId)}`,
      );
      setTemplates(result.templates ?? []);
      setTemplatesFor(selectedNumber.phoneNumberId);
      if ((result.templates ?? []).length === 0) {
        setTemplatesError("Meta returned no templates for this WABA.");
      }
    } catch (caught) {
      setTemplates([]);
      setTemplatesFor(null);
      setTemplatesError(caught?.message ?? "Could not load templates from Meta");
    } finally {
      setTemplatesPending(false);
    }
  }

  function refreshAll() {
    numbers.reload();
    webhook.reload();
  }

  function setManagementNumber(value) {
    setTest((current) => ({ ...current, numberId: value }));
  }

  function useTemplateInTest(template) {
    setTest((current) => ({
      ...current,
      type: "template",
      templateName: template.name,
      templateLanguage: template.language,
      components: "",
      numberId: current.numberId || list[0]?.id || "",
    }));
    setTab("connection");
    setNotice(
      `Template "${template.name}" selected in the test sender. Pick a recipient and press Send.`,
    );
  }

  async function sendTest(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setTestResult(null);
    try {
      const number = list.find((row) => row.id === numberId);
      const payload = {
        to: test.to,
        type: test.type,
        ...(number ? { phoneNumberId: number.phoneNumberId } : {}),
      };

      if (test.type === "text") {
        payload.text = test.text;
      } else if (test.type === "image" || test.type === "document") {
        payload.media = {
          link: test.mediaLink,
          caption: test.text || undefined,
          ...(test.type === "document" && test.filename ? { filename: test.filename } : {}),
        };
      } else if (test.type === "template") {
        payload.template = {
          name: test.templateName,
          language: test.templateLanguage || "en_US",
          ...(test.components.trim() ? { components: JSON.parse(test.components) } : {}),
        };
      }

      const result = await api.post("/api/whatsapp/messages", payload);
      setTestResult(result);
      numbers.reload();
    } catch (caught) {
      setError(caught?.message ?? "The message did not send");
    } finally {
      setPending(false);
    }
  }

  async function simulateInbound(event) {
    event.preventDefault();
    if (!selectedNumber) return;
    setPending(true);
    setError(null);
    setNotice(null);
    setInboundResult(null);
    try {
      const result = await api.post("/api/whatsapp/test-inbound", {
        phoneNumberId: selectedNumber.id,
        from: inbound.from,
        text: inbound.text,
      });
      setInboundResult(result);
      setNotice(
        `Inbound event injected. Open the Inbox to see ${inbound.from} and any automation/AI reply.`,
      );
      numbers.reload();
    } catch (caught) {
      setError(caught?.message ?? "Could not simulate an inbound message");
    } finally {
      setPending(false);
    }
  }

  const anySimulator = list.some((number) => number.providerMode === "simulator");

  return (
    <div className="space-y-5">
      <PageHeader
        title="WhatsApp"
        description="Operate the connected test number: send and receive messages, manage templates and Flows, and prove the pipeline end to end. Connection settings live in Settings."
        actions={
          <>
            <Button variant="outline" onClick={refreshAll}>
              <RefreshCw />
              Refresh
            </Button>
            <Button asChild>
              <Link href="/settings">
                <Settings />
                Connection settings
              </Link>
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

      <ErrorAlert error={error} />

      {notice ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          <Check className="size-4" />
          {notice}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="gap-5">
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="connection">Connection</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="flows">Flows</TabsTrigger>
        </TabsList>

        <TabsContent value="connection">
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
                description="Find and connect your Meta test number in Settings → WhatsApp, or add a simulator number to test locally."
                action={
                  <Button size="sm" asChild>
                    <Link href="/settings">
                      <Settings />
                      Open connection settings
                    </Link>
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
                        <Button variant="ghost" size="sm" asChild>
                          <Link href="/settings">Manage</Link>
                        </Button>
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
                      <SecretBadge label="account token" ok={number.account?.hasAccessToken} />
                      {number.account?.wabaId ? (
                        <StatusBadge tone="zinc">WABA {number.account.wabaId}</StatusBadge>
                      ) : null}
                      {number.account?.name ? (
                        <StatusBadge tone="zinc">{number.account.name}</StatusBadge>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

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
                    <dt className="text-muted-foreground">Verify token (effective)</dt>
                    <dd>
                      <SecretBadge label="" ok={webhook.data.verifyTokenConfigured} />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">App secret (effective)</dt>
                    <dd>
                      <SecretBadge label="" ok={webhook.data.appSecretConfigured} />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Access token (effective)</dt>
                    <dd>
                      <SecretBadge label="" ok={webhook.data.accessTokenConfigured} />
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
                  In Meta → WhatsApp → Configuration, paste the callback URL and the verify token
                  from Settings → API credentials (or the server environment), then subscribe to
                  the <span className="font-medium text-foreground">messages</span> field.
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
                <Label htmlFor="test-type">Message type</Label>
                <Select
                  value={test.type}
                  onValueChange={(value) => setTest({ ...test, type: value })}
                >
                  <SelectTrigger id="test-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="document">Document</SelectItem>
                    <SelectItem value="template">Template</SelectItem>
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

              {test.type === "image" || test.type === "document" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="test-media">Media URL</Label>
                    <Input
                      id="test-media"
                      type="url"
                      value={test.mediaLink}
                      onChange={(event) => setTest({ ...test, mediaLink: event.target.value })}
                      placeholder="https://cdn.example.com/file.jpg"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Must be publicly reachable by Meta over HTTPS.
                    </p>
                  </div>
                  {test.type === "document" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="test-filename">Filename (optional)</Label>
                      <Input
                        id="test-filename"
                        value={test.filename}
                        onChange={(event) => setTest({ ...test, filename: event.target.value })}
                        placeholder="invoice.pdf"
                      />
                    </div>
                  ) : null}
                </>
              ) : null}

              {test.type === "template" ? (
                <>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="test-template-pick">Approved template</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={templatesPending || !selectedNumber}
                        onClick={loadTemplates}
                      >
                        {templatesPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                        {templatesLoaded ? "Reload from Meta" : "Load from Meta"}
                      </Button>
                    </div>
                    {templatesLoaded && templates.length > 0 ? (
                      <Select
                        value={`${test.templateName}:${test.templateLanguage}`}
                        onValueChange={(value) => {
                          const picked = templates.find(
                            (template) =>
                              `${template.name}:${template.language}` === value,
                          );
                          if (picked) {
                            setTest((current) => ({
                              ...current,
                              templateName: picked.name,
                              templateLanguage: picked.language,
                            }));
                          }
                        }}
                      >
                        <SelectTrigger id="test-template-pick" className="w-full">
                          <SelectValue placeholder="Choose a template" />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((template) => (
                            <SelectItem
                              key={`${template.name}:${template.language}`}
                              value={`${template.name}:${template.language}`}
                            >
                              {template.name} · {template.language} ·{" "}
                              {template.category ?? "uncategorised"} · {template.status ?? "unknown"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Templates live on Meta. Load them for the WABA attached to this number,
                        or type the name and language by hand.
                      </p>
                    )}
                    {templatesError ? (
                      <p className="flex items-start gap-1.5 text-xs text-rose-700 dark:text-rose-300">
                        <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                        {templatesError}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="test-template">Template name</Label>
                      <Input
                        id="test-template"
                        value={test.templateName}
                        onChange={(event) => setTest({ ...test, templateName: event.target.value })}
                        placeholder="order_update"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="test-language">Language</Label>
                      <Input
                        id="test-language"
                        value={test.templateLanguage}
                        onChange={(event) =>
                          setTest({ ...test, templateLanguage: event.target.value })
                        }
                        placeholder="en_US"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="test-components">Components JSON (optional)</Label>
                    <Textarea
                      id="test-components"
                      value={test.components}
                      onChange={(event) => setTest({ ...test, components: event.target.value })}
                      placeholder='[{"type":"body","parameters":[{"type":"text","text":"Ada"}]}]'
                      className="font-mono text-xs"
                    />
                  </div>
                </>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="test-text">
                  {test.type === "text" ? "Text" : test.type === "template" ? "Note (not sent)" : "Caption"}
                </Label>
                <Textarea
                  id="test-text"
                  value={test.text}
                  onChange={(event) => setTest({ ...test, text: event.target.value })}
                  required={test.type === "text"}
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

          {selectedNumber?.providerMode === "simulator" ? (
            <SectionCard
              title="Simulate an inbound message"
              description="Inject a Meta-shaped event into the real webhook pipeline. Simulator numbers only."
            >
              <form className="space-y-3" onSubmit={simulateInbound}>
                <div className="space-y-1.5">
                  <Label htmlFor="inbound-from">Customer phone</Label>
                  <Input
                    id="inbound-from"
                    value={inbound.from}
                    onChange={(event) => setInbound({ ...inbound, from: event.target.value })}
                    placeholder="15550001111"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Digits only, as Meta sends them. This creates a contact and conversation.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inbound-text">Message</Label>
                  <Textarea
                    id="inbound-text"
                    value={inbound.text}
                    onChange={(event) => setInbound({ ...inbound, text: event.target.value })}
                    required
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={pending}>
                    {pending ? <Loader2 className="animate-spin" /> : null}
                    Inject inbound
                  </Button>
                </div>
                {inboundResult?.message ? (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                    Stored message {inboundResult.message.id} in conversation{" "}
                    {inboundResult.message.conversationId}. Check the Inbox.
                  </p>
                ) : null}
              </form>
            </SectionCard>
          ) : null}
          </div>
          </div>
        </TabsContent>

        <TabsContent value="templates">
          <TemplatesPanel
            numbers={list}
            numberId={numberId}
            onNumberChange={setManagementNumber}
            onUseTemplate={useTemplateInTest}
            onNotice={setNotice}
          />
        </TabsContent>

        <TabsContent value="flows">
          <FlowsPanel
            numbers={list}
            numberId={numberId}
            onNumberChange={setManagementNumber}
            onNotice={setNotice}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
