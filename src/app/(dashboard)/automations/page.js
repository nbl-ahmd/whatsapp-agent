"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Workflow as WorkflowIcon,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useResource } from "@/lib/useResource";
import { formatRelative, formatTime, personName, titleCase } from "@/lib/format";
import {
  EmptyState,
  ErrorAlert,
  LoadingRows,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Automations: event-driven JSON workflows, edited here and executed by the
 * backend engine. The editor only builds the shape the engine validates; it
 * never claims a workflow works before a test run says so.
 */

const TRIGGERS = [
  "MESSAGE_RECEIVED",
  "CONVERSATION_STARTED",
  "HUMAN_HANDOFF",
  "FLOW_COMPLETED",
  "ORDER_CREATED",
  "ORDER_UPDATED",
  "MESSAGE_SENT",
  "MESSAGE_STATUS",
];

const ACTION_FIELDS = {
  send_message: [{ key: "text", label: "Text", type: "textarea" }],
  send_template: [
    { key: "name", label: "Template name" },
    { key: "language", label: "Language code" },
  ],
  send_flow: [
    { key: "flowId", label: "Flow id" },
    { key: "flowToken", label: "Flow token" },
  ],
  add_tag: [{ key: "tag", label: "Tag" }],
  remove_tag: [{ key: "tag", label: "Tag" }],
  assign_agent: [{ key: "userId", label: "User id (optional)" }],
  set_variable: [
    { key: "key", label: "Variable" },
    { key: "value", label: "Value" },
  ],
  webhook: [{ key: "url", label: "URL", type: "url" }],
  delay: [{ key: "seconds", label: "Seconds", type: "number" }],
  ai_agent: [{ key: "agentId", label: "Agent id (optional)" }],
  handoff_human: [],
};

const CONDITION_FIELDS = {
  contains: [{ key: "value", label: "Text" }],
  equals: [{ key: "value", label: "Text" }],
  starts_with: [{ key: "value", label: "Text" }],
  variable_equals: [
    { key: "key", label: "Variable" },
    { key: "value", label: "Value" },
  ],
  contact_tag: [{ key: "value", label: "Tag" }],
  ai_intent: [{ key: "value", label: "Intent" }],
};

const BLANK = {
  id: null,
  name: "",
  description: "",
  trigger: "MESSAGE_RECEIVED",
  conditions: [{ type: "contains", value: "" }],
  actions: [{ type: "send_message", text: "" }],
  isActive: false,
};

const RUN_TONE = { failed: "red", skipped: "amber", success: "green", completed: "green" };

export default function AutomationsPage() {
  const list = useResource("/api/automations");
  const conversations = useResource("/api/conversations?limit=40");
  const [draft, setDraft] = useState(BLANK);
  const [runCache, setRunCache] = useState({ id: null, runs: [] });
  const [testConversation, setTestConversation] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const automations = list.data?.automations ?? [];
  const runs = runCache.id === draft.id ? runCache.runs : [];

  useEffect(() => {
    if (!draft.id) return undefined;
    const id = draft.id;
    let active = true;
    api
      .get(`/api/automations/${id}/runs?limit=8`)
      .then((result) => active && setRunCache({ id, runs: result.runs ?? [] }))
      .catch(() => active && setRunCache({ id, runs: [] }));
    return () => {
      active = false;
    };
  }, [draft.id]);

  function edit(automation) {
    setDraft({
      id: automation.id,
      name: automation.name,
      description: automation.description ?? "",
      trigger: automation.trigger,
      conditions: automation.conditions?.length ? automation.conditions : [],
      actions: automation.actions?.length ? automation.actions : [{ type: "send_message", text: "" }],
      isActive: automation.isActive,
    });
    setTestResult(null);
    setError(null);
    setNotice(null);
  }

  function newAutomation() {
    setDraft(BLANK);
    setTestResult(null);
    setError(null);
    setNotice(null);
  }

  function updateCondition(index, patch) {
    setDraft((current) => ({
      ...current,
      conditions: current.conditions.map((condition, position) =>
        position === index ? { ...condition, ...patch } : condition,
      ),
    }));
  }

  function updateAction(index, patch) {
    setDraft((current) => ({
      ...current,
      actions: current.actions.map((action, position) =>
        position === index ? { ...action, ...patch } : action,
      ),
    }));
  }

  const payload = useMemo(
    () => ({
      name: draft.name,
      description: draft.description || undefined,
      trigger: draft.trigger,
      conditions: draft.conditions
        .filter((condition) => Object.values(condition).some((value) => value !== ""))
        .map((condition) => ({
          type: condition.type,
          ...(condition.key ? { key: condition.key } : {}),
          ...(condition.value !== undefined ? { value: String(condition.value) } : {}),
        })),
      actions: draft.actions.map((action) => {
        const next = { type: action.type };
        for (const field of ACTION_FIELDS[action.type] ?? []) {
          if (action[field.key] !== undefined && action[field.key] !== "") {
            next[field.key] =
              field.type === "number" ? Number(action[field.key]) : action[field.key];
          }
        }
        return next;
      }),
      isActive: draft.isActive,
    }),
    [draft],
  );

  async function save(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const result = draft.id
        ? await api.patch(`/api/automations/${draft.id}`, payload)
        : await api.post("/api/automations", payload);
      const saved = result.automation;
      setDraft((current) => ({ ...current, id: saved.id }));
      setNotice(draft.id ? "Saved." : "Created. Turn it on when you are ready.");
      list.reload();
    } catch (caught) {
      setError(caught?.message ?? "Could not save the workflow");
    } finally {
      setPending(false);
    }
  }

  async function toggle(automation) {
    setPending(true);
    try {
      await api.post(`/api/automations/${automation.id}/toggle`, {
        isActive: !automation.isActive,
      });
      if (draft.id === automation.id) {
        setDraft((current) => ({ ...current, isActive: !automation.isActive }));
      }
      list.reload();
    } catch (caught) {
      setError(caught?.message ?? "Could not change that");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!draft.id) return;
    setPending(true);
    try {
      await api.del(`/api/automations/${draft.id}`);
      setDraft(BLANK);
      list.reload();
    } catch (caught) {
      setError(caught?.message ?? "Could not delete that automation");
    } finally {
      setPending(false);
    }
  }

  async function runTest() {
    if (!draft.id) return;
    setPending(true);
    setError(null);
    setTestResult(null);
    try {
      const result = await api.post(`/api/automations/${draft.id}/test`, {
        conversationId: testConversation || undefined,
      });
      setTestResult(result);
      list.reload();
      const refreshed = await api.get(`/api/automations/${draft.id}/runs?limit=8`);
      setRunCache({ id: draft.id, runs: refreshed.runs ?? [] });
    } catch (caught) {
      setError(caught?.message ?? "The test run failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Automations"
        description="Event-driven workflows. A matching automation runs before the AI answers the same message."
        actions={
          <>
            <Button variant="outline" onClick={newAutomation}>
              <Plus />
              New automation
            </Button>
            <Button variant="ghost" onClick={list.reload}>
              <RefreshCw />
              Refresh
            </Button>
          </>
        }
      />

      <ErrorAlert error={error || list.error} />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <SectionCard
          title="Workflows"
          description={`${automations.length} ${automations.length === 1 ? "rule" : "rules"}`}
        >
          {list.loading && automations.length === 0 ? (
            <LoadingRows rows={4} />
          ) : automations.length === 0 ? (
            <EmptyState
              icon={WorkflowIcon}
              title="No automations yet"
              description="Start with one that sends a refund request to a person."
            />
          ) : (
            <ul className="space-y-3">
              {automations.map((automation) => (
                <li key={automation.id}>
                  <Card
                    className={`gap-0 py-0 transition-colors ${
                      automation.id === draft.id ? "ring-primary/40" : ""
                    }`}
                  >
                    <CardContent className="space-y-2.5 p-3.5">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">{automation.name}</p>
                            <StatusBadge tone={automation.isActive ? "green" : "zinc"}>
                              {automation.isActive ? "On" : "Off"}
                            </StatusBadge>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {titleCase(automation.trigger)} · {automation.conditions?.length ?? 0}{" "}
                            conditions · {automation.actions?.length ?? 0} actions ·{" "}
                            {automation._count?.runs ?? 0} runs
                          </p>
                        </div>
                        <Switch
                          checked={automation.isActive}
                          disabled={pending}
                          onCheckedChange={() => toggle(automation)}
                          aria-label={`Toggle ${automation.name}`}
                        />
                      </div>

                      {automation.description ? (
                        <p className="text-xs text-muted-foreground">{automation.description}</p>
                      ) : null}

                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => edit(automation)}>
                          Edit
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {automation.runs?.[0]
                            ? `last run ${formatRelative(automation.runs[0].createdAt)}`
                            : "never run"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <div className="space-y-5">
          <SectionCard
            title={draft.id ? "Edit workflow" : "New workflow"}
            description="Conditions must all match before the actions run in order"
            action={
              draft.id ? (
                <StatusBadge tone={draft.isActive ? "green" : "zinc"}>
                  {draft.isActive ? "Active" : "Inactive"}
                </StatusBadge>
              ) : null
            }
          >
            <form className="space-y-4" onSubmit={save}>
              <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr]">
                <div className="space-y-1.5">
                  <Label htmlFor="automation-name">Name</Label>
                  <Input
                    id="automation-name"
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    placeholder="Refund requests to a human"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="automation-trigger">Trigger</Label>
                  <Select
                    value={draft.trigger}
                    onValueChange={(value) => setDraft({ ...draft, trigger: value })}
                  >
                    <SelectTrigger id="automation-trigger" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRIGGERS.map((trigger) => (
                        <SelectItem key={trigger} value={trigger}>
                          {titleCase(trigger)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="automation-description">Description</Label>
                <Input
                  id="automation-description"
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  placeholder="What this rule is for, in one line"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label>Conditions (all must match)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        conditions: [...current.conditions, { type: "contains", value: "" }],
                      }))
                    }
                  >
                    <Plus />
                    Condition
                  </Button>
                </div>

                {draft.conditions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No conditions: the automation runs on every event of its trigger.
                  </p>
                ) : null}

                <div className="space-y-2">
                  {draft.conditions.map((condition, index) => (
                    <div key={index} className="flex flex-wrap items-center gap-2">
                      <Select
                        value={condition.type}
                        onValueChange={(value) =>
                          updateCondition(index, { type: value, key: "", value: "" })
                        }
                      >
                        <SelectTrigger
                          className="w-[160px]"
                          aria-label={`Condition ${index + 1} type`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(CONDITION_FIELDS).map((type) => (
                            <SelectItem key={type} value={type}>
                              {titleCase(type)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex flex-1 flex-wrap gap-2">
                        {(CONDITION_FIELDS[condition.type] ?? []).map((field) => (
                          <Input
                            key={field.key}
                            className="min-w-[140px] flex-1"
                            value={condition[field.key] ?? ""}
                            placeholder={field.label}
                            aria-label={`Condition ${index + 1} ${field.label}`}
                            onChange={(event) =>
                              updateCondition(index, { [field.key]: event.target.value })
                            }
                          />
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove condition ${index + 1}`}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            conditions: current.conditions.filter(
                              (_, position) => position !== index,
                            ),
                          }))
                        }
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label>Actions (in order)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        actions: [...current.actions, { type: "send_message", text: "" }],
                      }))
                    }
                  >
                    <Plus />
                    Action
                  </Button>
                </div>

                <div className="space-y-2">
                  {draft.actions.map((action, index) => (
                    <div key={index} className="rounded-xl border p-3">
                      <div className="flex items-center gap-2">
                        <Select
                          value={action.type}
                          onValueChange={(value) =>
                            setDraft((current) => ({
                              ...current,
                              actions: current.actions.map((entry, position) =>
                                position === index ? { type: value } : entry,
                              ),
                            }))
                          }
                        >
                          <SelectTrigger
                            className="w-[190px]"
                            aria-label={`Action ${index + 1} type`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.keys(ACTION_FIELDS).map((type) => (
                              <SelectItem key={type} value={type}>
                                {titleCase(type)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="ml-auto" />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove action ${index + 1}`}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              actions: current.actions.filter(
                                (_, position) => position !== index,
                              ),
                            }))
                          }
                        >
                          <X />
                        </Button>
                      </div>
                      {(ACTION_FIELDS[action.type] ?? []).length > 0 ? (
                        <div className="mt-2 space-y-2">
                          {(ACTION_FIELDS[action.type] ?? []).map((field) =>
                            field.type === "textarea" ? (
                              <Textarea
                                key={field.key}
                                value={action[field.key] ?? ""}
                                placeholder={field.label}
                                aria-label={`Action ${index + 1} ${field.label}`}
                                onChange={(event) =>
                                  updateAction(index, { [field.key]: event.target.value })
                                }
                              />
                            ) : (
                              <Input
                                key={field.key}
                                type={field.type === "number" ? "number" : "text"}
                                value={action[field.key] ?? ""}
                                placeholder={field.label}
                                aria-label={`Action ${index + 1} ${field.label}`}
                                onChange={(event) =>
                                  updateAction(index, { [field.key]: event.target.value })
                                }
                              />
                            ),
                          )}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <Label htmlFor="automation-active">Active</Label>
                  <p className="text-xs text-muted-foreground">
                    Inactive workflows are still validated and testable, but never run.
                  </p>
                </div>
                <Switch
                  id="automation-active"
                  checked={draft.isActive}
                  onCheckedChange={(value) => setDraft({ ...draft, isActive: value })}
                />
              </div>

              {notice ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <CircleCheck className="size-4" />
                  {notice}
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                {draft.id ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={remove}
                    disabled={pending}
                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400"
                  >
                    <Trash2 />
                    Delete
                  </Button>
                ) : null}
                <span className="ml-auto" />
                <Button type="submit" disabled={pending || !draft.name.trim()}>
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  {draft.id ? "Save changes" : "Create workflow"}
                </Button>
              </div>
            </form>
          </SectionCard>

          {draft.id ? (
            <SectionCard title="Test run" description="Runs the conditions against a real thread">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="test-conversation">Conversation</Label>
                  <Select
                    value={testConversation || "none"}
                    onValueChange={(value) => setTestConversation(value === "none" ? "" : value)}
                  >
                    <SelectTrigger id="test-conversation" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        No conversation (conditions see no message)
                      </SelectItem>
                      {(conversations.data?.conversations ?? []).map((conversation) => (
                        <SelectItem key={conversation.id} value={conversation.id}>
                          {personName(conversation.contact)} —{" "}
                          {conversation.lastMessagePreview ?? "no preview"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  {!draft.isActive ? (
                    <span className="text-xs text-muted-foreground">
                      Inactive workflows still run in a test
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    className="ml-auto"
                    onClick={runTest}
                    disabled={pending}
                  >
                    <Play />
                    Run test
                  </Button>
                </div>

                {testResult ? (
                  <div className="space-y-3">
                    <div
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        testResult.matched
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                          : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
                      }`}
                    >
                      {testResult.matched ? (
                        <CircleCheck className="size-4" />
                      ) : (
                        <CircleAlert className="size-4" />
                      )}
                      <span className="font-semibold">
                        {testResult.matched ? "Matched" : "Did not match"}
                      </span>
                      {testResult.skipped ? <span>— {testResult.skipped}</span> : null}
                    </div>

                    {Array.isArray(testResult.conditions) ? (
                      <ul className="space-y-1.5">
                        {testResult.conditions.map((condition, index) => (
                          <li key={index} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              {condition.label ?? condition.type}
                            </span>
                            <StatusBadge tone={condition.passed ? "green" : "red"}>
                              {condition.passed ? "passed" : "failed"}
                            </StatusBadge>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {Array.isArray(testResult.actions) ? (
                      <pre className="max-h-44 overflow-auto rounded-lg border bg-muted/50 p-3 text-[11px] leading-4">
                        {JSON.stringify(testResult.actions, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </SectionCard>
          ) : null}

          {draft.id ? (
            <SectionCard title="Recent runs" contentClassName="px-0">
              {runs.length === 0 ? (
                <p className="px-4 text-sm text-muted-foreground">
                  No runs recorded for this workflow.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>When</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Contact</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatTime(run.createdAt)}
                        </TableCell>
                        <TableCell className="text-sm">{titleCase(run.eventType)}</TableCell>
                        <TableCell>
                          <StatusBadge tone={RUN_TONE[run.status] ?? "zinc"}>
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
        </div>
      </div>
    </div>
  );
}
