"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  CircleAlert,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  findComponent,
  templateBodyText,
  templateButtons,
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

const CATEGORIES = ["UTILITY", "MARKETING", "AUTHENTICATION"];
const LANGUAGES = ["en_US", "en_GB", "es_ES", "pt_BR", "fr_FR", "de_DE", "hi_IN", "ar_AR"];
const BUTTON_TYPES = [
  { value: "QUICK_REPLY", label: "Quick reply" },
  { value: "URL", label: "Website URL" },
  { value: "PHONE_NUMBER", label: "Call phone number" },
  { value: "FLOW", label: "WhatsApp Flow" },
];

const EMPTY_FORM = {
  name: "",
  language: "en_US",
  category: "UTILITY",
  header: "",
  body: "",
  footer: "",
  examples: "",
  parameterFormat: "POSITIONAL",
  buttons: [],
  useAdvanced: false,
  componentsJson: "",
};

function exampleValues(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function positionalVariables(text) {
  return [...String(text ?? "").matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
}

function namedVariables(text) {
  return [...String(text ?? "").matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)].map(
    (match) => match[1],
  );
}

function namedExamples(value) {
  const result = {};
  for (const item of String(value ?? "").split(",")) {
    const [key, ...rest] = item.split("=");
    if (key?.trim() && rest.length > 0) result[key.trim()] = rest.join("=").trim();
  }
  return result;
}

/** Build a small, predictable subset of the Meta components schema. */
export function buildTemplateComponents(form) {
  const components = [];
  const bodyText = String(form.body ?? "").trim();
  if (!bodyText) throw new Error("Body text is required");

  const headerText = String(form.header ?? "").trim();
  if (headerText) {
    const header = { type: "HEADER", format: "TEXT", text: headerText };
    const headerVars = positionalVariables(headerText);
    if (headerVars.length > 0) {
      const values = exampleValues(form.examples);
      const needed = Math.max(...headerVars);
      if (values.length < needed) {
        throw new Error(`Provide ${needed} example values for the header/body variables`);
      }
      header.example = { header_text: values.slice(0, needed) };
    }
    components.push(header);
  }

  const body = { type: "BODY", text: bodyText };
  const named = namedVariables(bodyText);
  const positional = positionalVariables(bodyText);

  if (named.length > 0) {
    const examples = namedExamples(form.examples);
    const missing = named.filter((name) => !examples[name]);
    if (missing.length > 0) {
      throw new Error(
        `Add example values for named variables (${missing.join(", ")}) as name=value, comma separated`,
      );
    }
    body.example = {
      body_text_named_params: named.map((name) => ({
        param_name: name,
        example: examples[name],
      })),
    };
  } else if (positional.length > 0) {
    const needed = Math.max(...positional);
    const values = exampleValues(form.examples);
    if (values.length < needed) {
      throw new Error(`Provide ${needed} example values for the body variables`);
    }
    body.example = { body_text: [values.slice(0, needed)] };
  }
  components.push(body);

  const footerText = String(form.footer ?? "").trim();
  if (footerText) components.push({ type: "FOOTER", text: footerText });

  if (form.buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: form.buttons.map((button) => {
        const base = { type: button.type, text: String(button.text ?? "").trim() };
        if (!base.text) throw new Error("Every button needs label text");
        if (button.type === "URL") {
          const url = String(button.url ?? "").trim();
          if (!/^https?:\/\//i.test(url)) throw new Error("URL buttons need an http(s) URL");
          return { ...base, url };
        }
        if (button.type === "PHONE_NUMBER") {
          const phone = String(button.phone_number ?? "").trim();
          if (!phone) throw new Error("Call buttons need a phone number");
          return { ...base, phone_number: phone };
        }
        if (button.type === "FLOW") {
          const flowId = String(button.flow_id ?? "").trim();
          if (!flowId) throw new Error("Flow buttons need a Flow id (or use the Flows tab)");
          return {
            ...base,
            flow_id: flowId,
            flow_action: button.flow_action || "navigate",
            navigate_screen: button.navigate_screen || "FIRST_ENTRY_SCREEN",
          };
        }
        return base;
      }),
    });
  }

  return components;
}

function newButton(type = "QUICK_REPLY") {
  return {
    type,
    text: type === "FLOW" ? "Open Flow" : type === "URL" ? "Visit website" : "Yes",
    url: "",
    phone_number: "",
    flow_id: "",
    flow_action: "navigate",
    navigate_screen: "FIRST_ENTRY_SCREEN",
  };
}

function formForEdit(template) {
  const header = findComponent(template, "HEADER");
  const footer = findComponent(template, "FOOTER");
  return {
    ...EMPTY_FORM,
    name: template.name ?? "",
    language: template.language ?? "en_US",
    category: String(template.category ?? "UTILITY").toUpperCase(),
    header: header?.format === "TEXT" ? header.text ?? "" : "",
    body: templateBodyText(template),
    footer: footer?.text ?? "",
    parameterFormat: template.parameterFormat ?? "POSITIONAL",
    buttons: templateButtons(template).map((button) => ({
      type: String(button.type ?? "QUICK_REPLY").toUpperCase(),
      text: button.text ?? "",
      url: button.url ?? "",
      phone_number: button.phone_number ?? "",
      flow_id: button.flow_id ?? "",
      flow_action: button.flow_action ?? "navigate",
      navigate_screen: button.navigate_screen ?? "FIRST_ENTRY_SCREEN",
    })),
    useAdvanced: true,
    componentsJson: JSON.stringify(template.components ?? [], null, 2),
  };
}

export function TemplatesPanel({ numbers, numberId, onNumberChange, onUseTemplate, onNotice }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const selectedNumber = numbers.find((number) => number.id === numberId) ?? null;

  const loadTemplates = useCallback(async () => {
    if (!selectedNumber) {
      setTemplates([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const status = statusFilter === "ALL" ? "all" : statusFilter.toLowerCase();
      const result = await api.get(
        `/api/whatsapp/templates?phoneNumberId=${encodeURIComponent(
          selectedNumber.phoneNumberId,
        )}&status=${encodeURIComponent(status)}&limit=100`,
      );
      setTemplates(result.templates ?? []);
    } catch (caught) {
      setTemplates([]);
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [selectedNumber, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadTemplates();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadTemplates]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return templates;
    return templates.filter((template) =>
      [template.name, template.language, template.category, template.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [templates, search]);

  function startNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
    setError(null);
  }

  function startEdit(template) {
    setEditing(template);
    setForm(formForEdit(template));
    setFormOpen(true);
    setError(null);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function patchButton(index, patch) {
    setForm((current) => ({
      ...current,
      buttons: current.buttons.map((button, buttonIndex) =>
        buttonIndex === index ? { ...button, ...patch } : button,
      ),
    }));
  }

  function toggleAdvanced(checked) {
    setForm((current) => {
      if (checked && !current.componentsJson.trim()) {
        try {
          return {
            ...current,
            useAdvanced: true,
            componentsJson: JSON.stringify(buildTemplateComponents(current), null, 2),
          };
        } catch {
          return { ...current, useAdvanced: true };
        }
      }
      return { ...current, useAdvanced: checked };
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (!selectedNumber) return;
    setPending(true);
    setError(null);

    try {
      let components;
      if (form.useAdvanced) {
        try {
          components = JSON.parse(form.componentsJson);
        } catch {
          throw new Error("Components JSON must be valid JSON");
        }
      } else {
        components = buildTemplateComponents(form);
      }

      const base = {
        phoneNumberId: selectedNumber.phoneNumberId,
        components,
        parameterFormat: form.parameterFormat,
      };

      if (editing) {
        await api.patch(`/api/whatsapp/templates/${encodeURIComponent(editing.id)}`, {
          ...base,
          ...(String(editing.status).toUpperCase() === "APPROVED"
            ? {}
            : { category: form.category }),
        });
        onNotice?.(`Template "${editing.name}" updated. Meta will re-review the change.`);
      } else {
        await api.post("/api/whatsapp/templates", {
          ...base,
          name: form.name,
          language: form.language,
          category: form.category,
        });
        onNotice?.(
          `Template "${form.name}" submitted. It is PENDING until Meta approves it.`,
        );
      }

      closeForm();
      await loadTemplates();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  async function remove(template) {
    if (!selectedNumber) return;
    if (
      !window.confirm(
        `Delete "${template.name}" (${template.language})? Meta also deletes the other language versions with that name.`,
      )
    ) {
      return;
    }

    setPending(true);
    setError(null);
    try {
      await api.del(
        `/api/whatsapp/templates/${encodeURIComponent(
          template.id,
        )}?phoneNumberId=${encodeURIComponent(selectedNumber.phoneNumberId)}`,
      );
      onNotice?.(`Template "${template.name}" deleted.`);
      await loadTemplates();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const canEditStatus = ["APPROVED", "REJECTED", "PAUSED"].includes(
    String(editing?.status ?? "").toUpperCase(),
  );

  return (
    <div className="space-y-5">
      <SectionCard
        title="Message templates"
        description="Meta is the source of truth. Create, edit and delete templates here; the inbox only offers approved ones."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadTemplates} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Refresh
            </Button>
            <Button size="sm" onClick={startNew} disabled={!selectedNumber}>
              <Plus />
              New template
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="templates-number">Number</Label>
            <Select value={numberId || ""} onValueChange={onNumberChange}>
              <SelectTrigger id="templates-number" className="w-full">
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
          <div className="w-full space-y-1.5 sm:w-44">
            <Label htmlFor="templates-status">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger id="templates-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="PAUSED">Paused</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="relative w-full space-y-1.5 sm:w-56">
            <Label htmlFor="templates-search">Search</Label>
            <Search className="pointer-events-none absolute left-2.5 top-[34px] size-4 text-muted-foreground" />
            <Input
              id="templates-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, language…"
              className="pl-8"
            />
          </div>
        </div>

        {selectedNumber?.account?.wabaId ? null : (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            Add a WABA id and access token to this number before managing templates.
          </p>
        )}

        {error ? <ErrorAlert error={error} className="mt-3" /> : null}

        <div className="mt-4">
          {loading && templates.length === 0 ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={templates.length === 0 ? "No templates yet" : "No matching templates"}
              description={
                templates.length === 0
                  ? "Create a template here, or build one in Meta WhatsApp Manager. New templates stay PENDING until Meta approves them."
                  : "Change the status filter or search text."
              }
              action={
                templates.length === 0 ? (
                  <Button size="sm" onClick={startNew} disabled={!selectedNumber}>
                    <Plus />
                    Create template
                  </Button>
                ) : null
              }
            />
          ) : (
            <ul className="space-y-3">
              {filtered.map((template) => {
                const flowButton = templateButtons(template).find(
                  (button) => String(button.type).toUpperCase() === "FLOW",
                );
                return (
                  <li key={template.id} className="rounded-xl border p-3.5">
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-mono text-sm font-semibold">{template.name}</p>
                          <StatusBadge tone={templateStatusTone(template.status)}>
                            {template.status ?? "unknown"}
                          </StatusBadge>
                          <StatusBadge tone="zinc">{template.language}</StatusBadge>
                          <StatusBadge tone="indigo">{template.category}</StatusBadge>
                          {flowButton ? <StatusBadge tone="violet">Flow</StatusBadge> : null}
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                          {templateBodyText(template) || "No body component"}
                        </p>
                        {template.rejectedReason ? (
                          <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                            Rejected: {template.rejectedReason}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onUseTemplate?.(template)}
                          disabled={String(template.status).toUpperCase() !== "APPROVED"}
                        >
                          <Send />
                          Use
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(template)}
                          disabled={!["APPROVED", "REJECTED", "PAUSED"].includes(
                            String(template.status).toUpperCase(),
                          )}
                        >
                          <Pencil />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(template)}
                          disabled={pending}
                          className="text-rose-600 hover:text-rose-700 dark:text-rose-300"
                        >
                          <Trash2 />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SectionCard>

      {formOpen ? (
        <SectionCard
          title={editing ? `Edit ${editing.name}` : "Create a template"}
          description={
            editing
              ? "Editing replaces all components. Approved templates can be edited 10 times in 30 days; Meta re-reviews every edit."
              : "Template names use lowercase letters, numbers and underscores. Meta reviews every new template."
          }
          action={
            <Button variant="ghost" size="sm" onClick={closeForm}>
              <X />
              Close
            </Button>
          }
        >
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="template-name">Name</Label>
                <Input
                  id="template-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value.toLowerCase() })
                  }
                  placeholder="order_update"
                  required
                  disabled={Boolean(editing)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="template-language">Language</Label>
                <Input
                  id="template-language"
                  value={form.language}
                  onChange={(event) => setForm({ ...form, language: event.target.value })}
                  placeholder="en_US"
                  required
                  disabled={Boolean(editing)}
                  list="template-languages"
                />
                <datalist id="template-languages">
                  {LANGUAGES.map((language) => (
                    <option key={language} value={language} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="template-category">Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(value) => setForm({ ...form, category: value })}
                  disabled={
                    Boolean(editing) &&
                    String(editing.status).toUpperCase() === "APPROVED"
                  }
                >
                  <SelectTrigger id="template-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editing && String(editing.status).toUpperCase() === "APPROVED" ? (
                  <p className="text-xs text-muted-foreground">
                    Meta does not allow an approved template&apos;s category to change.
                  </p>
                ) : null}
              </div>
            </div>

            {editing && !canEditStatus ? (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                Templates in {editing.status} status cannot be edited. Wait for review or create a
                new template.
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
              <div>
                <p className="text-sm font-medium">Advanced components JSON</p>
                <p className="text-xs text-muted-foreground">
                  Use this for media headers, carousels or components the builder does not cover.
                </p>
              </div>
              <Switch checked={form.useAdvanced} onCheckedChange={toggleAdvanced} />
            </div>

            {form.useAdvanced ? (
              <div className="space-y-1.5">
                <Label htmlFor="template-components">Components JSON</Label>
                <Textarea
                  id="template-components"
                  value={form.componentsJson}
                  onChange={(event) =>
                    setForm({ ...form, componentsJson: event.target.value })
                  }
                  className="min-h-56 font-mono text-xs"
                  spellCheck={false}
                />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="template-header">Header (optional, text)</Label>
                    <Input
                      id="template-header"
                      value={form.header}
                      onChange={(event) => setForm({ ...form, header: event.target.value })}
                      placeholder="Order update"
                      maxLength={60}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="template-footer">Footer (optional)</Label>
                    <Input
                      id="template-footer"
                      value={form.footer}
                      onChange={(event) => setForm({ ...form, footer: event.target.value })}
                      placeholder="Acme support"
                      maxLength={60}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="template-body">Body</Label>
                  <Textarea
                    id="template-body"
                    value={form.body}
                    onChange={(event) => setForm({ ...form, body: event.target.value })}
                    placeholder="Hi {{1}}, your order {{2}} is ready for pickup."
                    className="min-h-28"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Variables use <code>{"{{1}}"}</code> for positional parameters or{" "}
                    <code>{"{{first_name}}"}</code> for named parameters.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="template-params">Parameter format</Label>
                    <Select
                      value={form.parameterFormat}
                      onValueChange={(value) => setForm({ ...form, parameterFormat: value })}
                    >
                      <SelectTrigger id="template-params" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="POSITIONAL">Positional ({"{{1}}"})</SelectItem>
                        <SelectItem value="NAMED">Named ({"{{first_name}}"})</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="template-examples">Example values</Label>
                    <Input
                      id="template-examples"
                      value={form.examples}
                      onChange={(event) => setForm({ ...form, examples: event.target.value })}
                      placeholder="Ada, A-1042"
                    />
                    <p className="text-xs text-muted-foreground">
                      Comma separated. For named parameters use{" "}
                      <code>first_name=Ada, order=A-1042</code>.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Buttons (optional)</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setForm({ ...form, buttons: [...form.buttons, newButton()] })
                      }
                    >
                      <Plus />
                      Add button
                    </Button>
                  </div>
                  {form.buttons.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Add a quick reply, website, phone or Flow button. Flow buttons should
                      reference a published Flow id.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {form.buttons.map((button, index) => (
                        <div
                          key={index}
                          className="grid gap-2 rounded-lg border bg-muted/20 p-2 sm:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)_auto]"
                        >
                          <Select
                            value={button.type}
                            onValueChange={(value) =>
                              patchButton(index, { ...newButton(value), type: value })
                            }
                          >
                            <SelectTrigger size="sm" className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {BUTTON_TYPES.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={button.text}
                            onChange={(event) =>
                              patchButton(index, { text: event.target.value })
                            }
                            placeholder="Button label"
                            aria-label="Button label"
                          />
                          {button.type === "URL" ? (
                            <Input
                              value={button.url}
                              onChange={(event) =>
                                patchButton(index, { url: event.target.value })
                              }
                              placeholder="https://example.com"
                              aria-label="Button URL"
                            />
                          ) : button.type === "PHONE_NUMBER" ? (
                            <Input
                              value={button.phone_number}
                              onChange={(event) =>
                                patchButton(index, { phone_number: event.target.value })
                              }
                              placeholder="+15550100"
                              aria-label="Phone number"
                            />
                          ) : button.type === "FLOW" ? (
                            <Input
                              value={button.flow_id}
                              onChange={(event) =>
                                patchButton(index, { flow_id: event.target.value })
                              }
                              placeholder="Flow id"
                              aria-label="Flow id"
                              className="font-mono"
                            />
                          ) : (
                            <div className="hidden sm:block" />
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Remove button"
                            onClick={() =>
                              setForm({
                                ...form,
                                buttons: form.buttons.filter(
                                  (_, buttonIndex) => buttonIndex !== index,
                                ),
                              })
                            }
                          >
                            <X />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {error ? <ErrorAlert error={error} /> : null}

            <div className="flex flex-wrap items-center justify-end gap-2">
              {form.useAdvanced ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(form.componentsJson);
                      setForm((current) => ({
                        ...current,
                        componentsJson: JSON.stringify(parsed, null, 2),
                      }));
                      setError(null);
                      onNotice?.("Components JSON is valid.");
                    } catch {
                      setError({ message: "Components JSON is not valid JSON" });
                    }
                  }}
                >
                  <Check />
                  Validate JSON
                </Button>
              ) : null}
              <Button type="submit" disabled={pending || !selectedNumber || (editing && !canEditStatus)}>
                {pending ? <Loader2 className="animate-spin" /> : <Check />}
                {editing ? "Save template" : "Submit for review"}
              </Button>
            </div>
          </form>
        </SectionCard>
      ) : null}
    </div>
  );
}
