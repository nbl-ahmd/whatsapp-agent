"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  CircleAlert,
  ExternalLink,
  FileJson,
  Loader2,
  Plus,
  RefreshCw,
  Rocket,
  Send,
  Trash2,
  Upload,
  Workflow,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  flowStatusTone,
  templateFlowButtonIndex,
  templateHasFlowButton,
  templateStatusTone,
} from "@/lib/whatsapp";
import {
  EmptyState,
  ErrorAlert,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export const FLOW_CATEGORIES = [
  "OTHER",
  "SIGN_UP",
  "SIGN_IN",
  "APPOINTMENT_BOOKING",
  "LEAD_GENERATION",
  "CONTACT_US",
  "CUSTOMER_SUPPORT",
  "SURVEY",
];

export const FLOW_JSON_SAMPLE = JSON.stringify(
  {
    version: "6.0",
    screens: [
      {
        id: "WELCOME_SCREEN",
        title: "Contact us",
        terminal: true,
        success: true,
        data: {},
        layout: {
          type: "SingleColumnLayout",
          children: [
            { type: "TextHeading", text: "How can we help?" },
            { type: "TextInput", name: "name", label: "Your name" },
            { type: "TextArea", name: "message", label: "Message" },
            {
              type: "Footer",
              label: "Submit",
              "on-click-action": {
                name: "complete",
                payload: {
                  name: "${form.name}",
                  message: "${form.message}",
                },
              },
            },
          ],
        },
      },
    ],
  },
  null,
  2,
);

function templateNameFor(flow) {
  const base = String(flow?.name ?? "flow")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return `${base || "flow"}_flow`;
}

function formatValidationError(error) {
  return [error.error, error.message, error.pointers?.[0]?.path]
    .filter(Boolean)
    .join(" · ");
}

export function FlowsPanel({ numbers, numberId, onNumberChange, onNotice }) {
  const [flows, setFlows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newFlow, setNewFlow] = useState({
    name: "",
    category: "OTHER",
    flowJson: FLOW_JSON_SAMPLE,
    publish: false,
  });

  const [detail, setDetail] = useState(null);
  const [detailFor, setDetailFor] = useState(null);
  const [editor, setEditor] = useState(null);
  const [templateFlow, setTemplateFlow] = useState(null);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    language: "en_US",
    category: "MARKETING",
    body: "",
    buttonText: "Open Flow",
    footer: "",
  });
  const [sendForm, setSendForm] = useState({
    templateId: "",
    to: "",
    flowToken: "",
    flowActionData: "{}",
  });
  const [sendResult, setSendResult] = useState(null);

  const selectedNumber = numbers.find((number) => number.id === numberId) ?? null;
  const flowTemplates = useMemo(
    () => templates.filter((template) => templateHasFlowButton(template)),
    [templates],
  );
  const selectedTemplate =
    flowTemplates.find((template) => template.id === sendForm.templateId) ??
    flowTemplates[0] ??
    null;

  const loadFlows = useCallback(async () => {
    if (!selectedNumber) {
      setFlows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.get(
        `/api/whatsapp/flows?phoneNumberId=${encodeURIComponent(
          selectedNumber.phoneNumberId,
        )}&limit=100`,
      );
      setFlows(result.flows ?? []);
    } catch (caught) {
      setFlows([]);
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [selectedNumber]);

  const loadTemplates = useCallback(async () => {
    if (!selectedNumber) {
      setTemplates([]);
      return;
    }
    try {
      const result = await api.get(
        `/api/whatsapp/templates?phoneNumberId=${encodeURIComponent(
          selectedNumber.phoneNumberId,
        )}&status=approved&limit=100`,
      );
      setTemplates(result.templates ?? []);
    } catch (caught) {
      setTemplates([]);
      setError(caught);
    }
  }, [selectedNumber]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadFlows();
      void loadTemplates();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadFlows, loadTemplates]);

  function notify(message) {
    setNotice(message);
    onNotice?.(message);
  }

  async function openDetail(flow) {
    if (!selectedNumber) return;
    setDetailFor(flow.id);
    setError(null);
    try {
      const result = await api.get(
        `/api/whatsapp/flows/${encodeURIComponent(flow.id)}?phoneNumberId=${encodeURIComponent(
          selectedNumber.phoneNumberId,
        )}`,
      );
      setDetail(result.flow);
    } catch (caught) {
      setError(caught);
    } finally {
      setDetailFor(null);
    }
  }

  async function openEditor(flow) {
    if (!selectedNumber) return;
    setError(null);
    setEditor({ flow, loading: true, value: "", publishAfter: false });
    try {
      const result = await api.get(
        `/api/whatsapp/flows/${encodeURIComponent(
          flow.id,
        )}/json?phoneNumberId=${encodeURIComponent(selectedNumber.phoneNumberId)}`,
      );
      setEditor({
        flow,
        loading: false,
        value: JSON.stringify(result.flowJson, null, 2),
        publishAfter: false,
      });
    } catch (caught) {
      setEditor(null);
      setError(caught);
    }
  }

  async function createFlow(event) {
    event.preventDefault();
    if (!selectedNumber) return;
    setPending(true);
    setError(null);
    try {
      const result = await api.post("/api/whatsapp/flows", {
        phoneNumberId: selectedNumber.phoneNumberId,
        name: newFlow.name,
        categories: [newFlow.category],
        flowJson: newFlow.flowJson,
        publish: newFlow.publish,
      });
      notify(
        `Flow "${result.flow.name}" created (${result.flow.status}).${
          result.flow.validationErrors?.length
            ? " Meta returned validation errors; open it to see them."
            : ""
        }`,
      );
      setCreateOpen(false);
      setNewFlow({ name: "", category: "OTHER", flowJson: FLOW_JSON_SAMPLE, publish: false });
      await loadFlows();
      if (result.flow.id) await openDetail(result.flow);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  async function saveFlowJson(event) {
    event.preventDefault();
    if (!selectedNumber || !editor) return;
    setPending(true);
    setError(null);
    try {
      const result = await api.post(
        `/api/whatsapp/flows/${encodeURIComponent(editor.flow.id)}/assets`,
        {
          phoneNumberId: selectedNumber.phoneNumberId,
          flowJson: editor.value,
          publish: editor.publishAfter,
        },
      );
      if (result.validationErrors?.length > 0) {
        setError({
          message: `Meta rejected the Flow JSON: ${result.validationErrors
            .map(formatValidationError)
            .join("; ")}`,
        });
      } else {
        notify(
          result.published
            ? `Flow "${editor.flow.name}" updated and published.`
            : `Flow "${editor.flow.name}" updated. It stays DRAFT until you publish it.`,
        );
        setEditor(null);
        await loadFlows();
        await openDetail(editor.flow);
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  async function publish(flow) {
    if (!selectedNumber) return;
    setPending(true);
    setError(null);
    try {
      await api.post(`/api/whatsapp/flows/${encodeURIComponent(flow.id)}/publish`, {
        phoneNumberId: selectedNumber.phoneNumberId,
      });
      notify(`Flow "${flow.name}" published. You can now attach it to a template.`);
      await loadFlows();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  async function deprecate(flow) {
    if (!selectedNumber) return;
    if (!window.confirm(`Deprecate "${flow.name}"? It can no longer be sent.`)) return;
    setPending(true);
    setError(null);
    try {
      await api.post(`/api/whatsapp/flows/${encodeURIComponent(flow.id)}/deprecate`, {
        phoneNumberId: selectedNumber.phoneNumberId,
      });
      notify(`Flow "${flow.name}" deprecated.`);
      await loadFlows();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  async function remove(flow) {
    if (!selectedNumber) return;
    if (!window.confirm(`Delete the DRAFT Flow "${flow.name}"?`)) return;
    setPending(true);
    setError(null);
    try {
      await api.del(
        `/api/whatsapp/flows/${encodeURIComponent(
          flow.id,
        )}?phoneNumberId=${encodeURIComponent(selectedNumber.phoneNumberId)}`,
      );
      notify(`Flow "${flow.name}" deleted.`);
      await loadFlows();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  function startFlowTemplate(flow) {
    setError(null);
    setTemplateFlow(flow);
    setTemplateForm({
      name: templateNameFor(flow),
      language: "en_US",
      category: "MARKETING",
      body: `Tap the button below to open ${flow.name}.`,
      buttonText: "Open Flow",
      footer: "",
    });
  }

  async function createFlowTemplate(event) {
    event.preventDefault();
    if (!selectedNumber || !templateFlow) return;
    setPending(true);
    setError(null);
    try {
      await api.post("/api/whatsapp/templates", {
        phoneNumberId: selectedNumber.phoneNumberId,
        name: templateForm.name,
        language: templateForm.language,
        category: templateForm.category,
        components: [
          { type: "BODY", text: templateForm.body },
          ...(templateForm.footer
            ? [{ type: "FOOTER", text: templateForm.footer }]
            : []),
          {
            type: "BUTTONS",
            buttons: [
              {
                type: "FLOW",
                text: templateForm.buttonText,
                flow_id: templateFlow.id,
                flow_action: "navigate",
                navigate_screen: "FIRST_ENTRY_SCREEN",
              },
            ],
          },
        ],
      });
      notify(
        `Flow template "${templateForm.name}" submitted. For a test number, wait for APPROVED and then send it below.`,
      );
      setTemplateFlow(null);
      await loadTemplates();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  async function sendFlow(event) {
    event.preventDefault();
    if (!selectedNumber || !selectedTemplate) return;
    setPending(true);
    setError(null);
    setSendResult(null);
    try {
      let flowActionData;
      try {
        flowActionData = JSON.parse(sendForm.flowActionData || "{}");
      } catch {
        throw new Error("Flow action data must be valid JSON");
      }

      const index = templateFlowButtonIndex(selectedTemplate);
      const result = await api.post("/api/whatsapp/messages", {
        phoneNumberId: selectedNumber.phoneNumberId,
        to: sendForm.to,
        type: "template",
        template: {
          name: selectedTemplate.name,
          language: selectedTemplate.language,
          components: [
            {
              type: "button",
              sub_type: "flow",
              index: String(Math.max(index, 0)),
              parameters: [
                {
                  type: "action",
                  action: {
                    ...(sendForm.flowToken.trim()
                      ? { flow_token: sendForm.flowToken.trim() }
                      : {}),
                    ...(Object.keys(flowActionData).length > 0
                      ? { flow_action_data: flowActionData }
                      : {}),
                  },
                },
              ],
            },
          ],
        },
      });
      setSendResult(result);
      notify(`Flow template sent to ${sendForm.to}.`);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="flows-number">Number</Label>
          <Select value={numberId || ""} onValueChange={onNumberChange}>
            <SelectTrigger id="flows-number" className="w-full">
              <SelectValue placeholder="No number" />
            </SelectTrigger>
            <SelectContent>
              {numbers.map((number) => (
                <SelectItem key={number.id} value={number.id}>
                  {number.displayPhoneNumber} · {number.account?.wabaId ?? "no WABA"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={loadFlows} disabled={loading || !selectedNumber}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Refresh
        </Button>
        <Button onClick={() => setCreateOpen(true)} disabled={!selectedNumber}>
          <Plus />
          New Flow
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300">
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          Meta test numbers can only send <span className="font-semibold">templates</span>.
          Create a Flow, publish it, then use <span className="font-semibold">Create template</span>{" "}
          on the Flow and send that approved template from here.
        </p>
      </div>

      {error ? <ErrorAlert error={error} /> : null}
      {notice ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          <Check className="size-4" />
          {notice}
        </div>
      ) : null}

      {createOpen ? (
        <SectionCard
          title="Create a Flow"
          description="Meta validates the Flow JSON when you upload it. A new Flow starts as DRAFT."
          action={
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
              <X />
              Close
            </Button>
          }
        >
          <form className="space-y-4" onSubmit={createFlow}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="flow-name">Flow name</Label>
                <Input
                  id="flow-name"
                  value={newFlow.name}
                  onChange={(event) => setNewFlow({ ...newFlow, name: event.target.value })}
                  placeholder="Contact us"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="flow-category">Category</Label>
                <Select
                  value={newFlow.category}
                  onValueChange={(value) => setNewFlow({ ...newFlow, category: value })}
                >
                  <SelectTrigger id="flow-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FLOW_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="flow-json">Flow JSON</Label>
              <Textarea
                id="flow-json"
                value={newFlow.flowJson}
                onChange={(event) => setNewFlow({ ...newFlow, flowJson: event.target.value })}
                className="min-h-72 font-mono text-xs"
                spellCheck={false}
                required
              />
              <p className="text-xs text-muted-foreground">
                The sample is a one-screen contact form; replace it with your own Flow JSON.
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
              <div>
                <p className="text-sm font-medium">Publish immediately</p>
                <p className="text-xs text-muted-foreground">
                  Publishing may require business verification. If it fails, the Flow stays DRAFT.
                </p>
              </div>
              <Switch
                checked={newFlow.publish}
                onCheckedChange={(checked) => setNewFlow({ ...newFlow, publish: checked })}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Plus />}
                Create Flow
              </Button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      {editor ? (
        <SectionCard
          title={`Edit JSON · ${editor.flow.name}`}
          description="Uploading JSON replaces the Flow's asset. Published Flows return to DRAFT after an edit."
          action={
            <Button variant="ghost" size="sm" onClick={() => setEditor(null)}>
              <X />
              Close
            </Button>
          }
        >
          <form className="space-y-4" onSubmit={saveFlowJson}>
            {editor.loading ? (
              <Skeleton className="h-72 w-full rounded-xl" />
            ) : (
              <Textarea
                value={editor.value}
                onChange={(event) => setEditor({ ...editor, value: event.target.value })}
                className="min-h-80 font-mono text-xs"
                spellCheck={false}
              />
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={editor.publishAfter}
                  onCheckedChange={(checked) => setEditor({ ...editor, publishAfter: checked })}
                />
                Publish after upload
              </label>
              <Button type="submit" disabled={pending || editor.loading}>
                {pending ? <Loader2 className="animate-spin" /> : <Upload />}
                Upload JSON
              </Button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      {templateFlow ? (
        <SectionCard
          title={`Create a Flow template · ${templateFlow.name}`}
          description="This creates an approved-template candidate with a FLOW button. Test numbers can send it once Meta approves it."
          action={
            <Button variant="ghost" size="sm" onClick={() => setTemplateFlow(null)}>
              <X />
              Close
            </Button>
          }
        >
          <form className="space-y-4" onSubmit={createFlowTemplate}>
            {String(templateFlow.status).toUpperCase() !== "PUBLISHED" ? (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                This Flow is {templateFlow.status ?? "DRAFT"}. Meta normally expects a PUBLISHED
                Flow in a template. Publish it first for the best chance of approval.
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="flow-template-name">Template name</Label>
                <Input
                  id="flow-template-name"
                  value={templateForm.name}
                  onChange={(event) =>
                    setTemplateForm({
                      ...templateForm,
                      name: event.target.value.toLowerCase(),
                    })
                  }
                  required
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="flow-template-language">Language</Label>
                <Input
                  id="flow-template-language"
                  value={templateForm.language}
                  onChange={(event) =>
                    setTemplateForm({ ...templateForm, language: event.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="flow-template-category">Category</Label>
                <Select
                  value={templateForm.category}
                  onValueChange={(value) =>
                    setTemplateForm({ ...templateForm, category: value })
                  }
                >
                  <SelectTrigger id="flow-template-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MARKETING">MARKETING</SelectItem>
                    <SelectItem value="UTILITY">UTILITY</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="flow-template-body">Body</Label>
              <Textarea
                id="flow-template-body"
                value={templateForm.body}
                onChange={(event) =>
                  setTemplateForm({ ...templateForm, body: event.target.value })
                }
                required
                className="min-h-20"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="flow-template-button">Button label</Label>
                <Input
                  id="flow-template-button"
                  value={templateForm.buttonText}
                  onChange={(event) =>
                    setTemplateForm({ ...templateForm, buttonText: event.target.value })
                  }
                  maxLength={25}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="flow-template-footer">Footer (optional)</Label>
                <Input
                  id="flow-template-footer"
                  value={templateForm.footer}
                  onChange={(event) =>
                    setTemplateForm({ ...templateForm, footer: event.target.value })
                  }
                  maxLength={60}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <FileJson />}
                Create Flow template
              </Button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)]">
        <SectionCard
          title="Flows"
          description={`${flows.length} ${flows.length === 1 ? "Flow" : "Flows"} on this WABA`}
        >
          {!selectedNumber ? (
            <EmptyState
              icon={Workflow}
              title="No number selected"
              description="Add a Meta number with a WABA id first."
            />
          ) : loading && flows.length === 0 ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : flows.length === 0 ? (
            <EmptyState
              icon={Workflow}
              title="No Flows yet"
              description="Create a Flow here or in Meta WhatsApp Manager, then attach it to a template for a test number."
              action={
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus />
                  Create Flow
                </Button>
              }
            />
          ) : (
            <ul className="space-y-3">
              {flows.map((flow) => (
                <li key={flow.id} className="rounded-xl border p-3.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-semibold">{flow.name}</p>
                    <StatusBadge tone={flowStatusTone(flow.status)}>
                      {flow.status ?? "unknown"}
                    </StatusBadge>
                    {flow.categories?.map((category) => (
                      <StatusBadge key={category} tone="zinc">
                        {category}
                      </StatusBadge>
                    ))}
                    {flow.validationErrors?.length > 0 ? (
                      <StatusBadge tone="red">
                        {flow.validationErrors.length} validation error
                        {flow.validationErrors.length === 1 ? "" : "s"}
                      </StatusBadge>
                    ) : null}
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">id {flow.id}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDetail(flow)}
                      disabled={detailFor === flow.id}
                    >
                      {detailFor === flow.id ? <Loader2 className="animate-spin" /> : null}
                      View
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEditor(flow)}>
                      <FileJson />
                      Edit JSON
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => startFlowTemplate(flow)}>
                      <Plus />
                      Create template
                    </Button>
                    {String(flow.status).toUpperCase() === "DRAFT" ? (
                      <Button
                        size="sm"
                        onClick={() => publish(flow)}
                        disabled={pending}
                      >
                        <Rocket />
                        Publish
                      </Button>
                    ) : null}
                    {String(flow.status).toUpperCase() === "PUBLISHED" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deprecate(flow)}
                        disabled={pending}
                      >
                        Deprecate
                      </Button>
                    ) : null}
                    {["DRAFT", "DEPRECATED"].includes(String(flow.status).toUpperCase()) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(flow)}
                        disabled={pending}
                        className="text-rose-600 hover:text-rose-700 dark:text-rose-300"
                      >
                        <Trash2 />
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <div className="space-y-5">
          {detail ? (
            <SectionCard
              title="Flow details"
              description={detail.name}
              action={
                <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>
                  <X />
                </Button>
              }
            >
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <StatusBadge tone={flowStatusTone(detail.status)}>
                      {detail.status ?? "unknown"}
                    </StatusBadge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">JSON version</dt>
                  <dd className="font-mono text-xs">{detail.jsonVersion ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Data API</dt>
                  <dd className="font-mono text-xs">{detail.dataApiVersion ?? "—"}</dd>
                </div>
                {detail.healthStatus?.can_send_message ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Can send</dt>
                    <dd>
                      <StatusBadge
                        tone={
                          detail.healthStatus.can_send_message === "AVAILABLE"
                            ? "green"
                            : detail.healthStatus.can_send_message === "LIMITED"
                              ? "amber"
                              : "red"
                        }
                      >
                        {detail.healthStatus.can_send_message}
                      </StatusBadge>
                    </dd>
                  </div>
                ) : null}
              </dl>

              {detail.validationErrors?.length > 0 ? (
                <ul className="mt-3 space-y-1.5 text-xs text-rose-700 dark:text-rose-300">
                  {detail.validationErrors.map((validationError, index) => (
                    <li key={index} className="rounded-lg border border-rose-200 px-2 py-1.5">
                      {formatValidationError(validationError)}
                    </li>
                  ))}
                </ul>
              ) : null}

              {detail.previewUrl ? (
                <Button variant="outline" size="sm" className="mt-3" asChild>
                  <a href={detail.previewUrl} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    Open web preview
                  </a>
                </Button>
              ) : null}
            </SectionCard>
          ) : null}

          <SectionCard
            title="Send Flow via template"
            description="The test-number-safe path: an approved template with a FLOW button."
          >
            {flowTemplates.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  No approved template with a Flow button yet. Use{" "}
                  <span className="font-medium text-foreground">Create template</span> on a Flow,
                  wait for Meta to approve it, then reload.
                </p>
                <Button variant="outline" size="sm" onClick={loadTemplates} disabled={!selectedNumber}>
                  <RefreshCw />
                  Reload templates
                </Button>
              </div>
            ) : (
              <form className="space-y-3" onSubmit={sendFlow}>
                <div className="space-y-1.5">
                  <Label htmlFor="send-flow-template">Approved Flow template</Label>
                  <Select
                    value={selectedTemplate?.id ?? ""}
                    onValueChange={(value) => setSendForm({ ...sendForm, templateId: value })}
                  >
                    <SelectTrigger id="send-flow-template" className="w-full">
                      <SelectValue placeholder="Choose a template" />
                    </SelectTrigger>
                    <SelectContent>
                      {flowTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name} · {template.language}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTemplate ? (
                    <p className="text-xs text-muted-foreground">
                      Status{" "}
                      <StatusBadge tone={templateStatusTone(selectedTemplate.status)}>
                        {selectedTemplate.status}
                      </StatusBadge>
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="send-flow-to">Recipient</Label>
                  <Input
                    id="send-flow-to"
                    value={sendForm.to}
                    onChange={(event) => setSendForm({ ...sendForm, to: event.target.value })}
                    placeholder="+15550101"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    For a Meta test number, add this recipient in the app dashboard first.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="send-flow-token">Flow token</Label>
                  <Input
                    id="send-flow-token"
                    value={sendForm.flowToken}
                    onChange={(event) =>
                      setSendForm({ ...sendForm, flowToken: event.target.value })
                    }
                    placeholder="generated if blank"
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Returned with the completion webhook; include your own identifier here.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="send-flow-data">Flow action data (JSON, optional)</Label>
                  <Textarea
                    id="send-flow-data"
                    value={sendForm.flowActionData}
                    onChange={(event) =>
                      setSendForm({ ...sendForm, flowActionData: event.target.value })
                    }
                    className="min-h-20 font-mono text-xs"
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground">
                    Passed to the first screen when the Flow action is navigate/data_exchange.
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={pending || !selectedTemplate || !sendForm.to}
                >
                  {pending ? <Loader2 className="animate-spin" /> : <Send />}
                  Send Flow template
                </Button>

                {sendResult ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <span className="font-semibold">Sent.</span>{" "}
                    {sendResult.message?.status} ·{" "}
                    {sendResult.message?.externalMessageId ?? sendResult.message?.id}
                  </div>
                ) : null}
              </form>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
