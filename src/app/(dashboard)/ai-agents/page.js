"use client";

import { useMemo, useState } from "react";
import {
  Bot,
  CircleCheck,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Wrench,
} from "lucide-react";
import { api } from "@/lib/api";
import { useResource } from "@/lib/useResource";
import { personName } from "@/lib/format";
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
import { Checkbox } from "@/components/ui/checkbox";
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
 * AI agents: one system prompt plus the exact tools the agent may call.
 * The provider is deployment config, so the page reports which one is live
 * instead of offering a choice it cannot honour.
 */

const BLANK = {
  id: null,
  name: "",
  description: "",
  systemPrompt:
    "You are a concise WhatsApp support assistant. Answer from the conversation, use a tool when you need a fact, and hand the conversation to a person whenever the customer asks for one.",
  model: "",
  temperature: 0.3,
  maxTokens: 400,
  toolIds: [],
  isActive: true,
};

function toDraft(agent) {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description ?? "",
    systemPrompt: agent.systemPrompt ?? "",
    model: agent.model ?? "",
    temperature: agent.temperature ?? 0.3,
    maxTokens: agent.maxTokens ?? 400,
    toolIds: (agent.tools ?? []).map((tool) => tool.id),
    isActive: agent.isActive,
  };
}

export default function AgentsPage() {
  const list = useResource("/api/ai-agents");
  const tools = useResource("/api/tools");
  const conversations = useResource("/api/conversations?limit=40");

  const [draft, setDraft] = useState(null);
  const [previewConversation, setPreviewConversation] = useState("");
  const [preview, setPreview] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const agents = list.data?.agents ?? [];
  const provider = list.data?.provider ?? "mock";
  const toolOptions = useMemo(
    () => tools.data?.tools ?? list.data?.tools ?? [],
    [tools.data, list.data],
  );

  const active = draft ?? (agents[0] ? toDraft(agents[0]) : BLANK);

  function edit(agent) {
    setDraft(toDraft(agent));
    setPreview(null);
    setError(null);
    setNotice(null);
  }

  function newAgent() {
    setDraft(BLANK);
    setPreview(null);
    setError(null);
    setNotice(null);
  }

  function toggleTool(toolId) {
    setDraft({
      ...active,
      toolIds: active.toolIds.includes(toolId)
        ? active.toolIds.filter((id) => id !== toolId)
        : [...active.toolIds, toolId],
    });
  }

  async function save(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);

    const payload = {
      name: active.name,
      description: active.description || undefined,
      systemPrompt: active.systemPrompt,
      ...(active.model ? { model: active.model } : {}),
      temperature: Number(active.temperature),
      maxTokens: Number(active.maxTokens),
      toolIds: active.toolIds,
      isActive: active.isActive,
    };

    try {
      const result = active.id
        ? await api.patch(`/api/ai-agents/${active.id}`, payload)
        : await api.post("/api/ai-agents", payload);
      setDraft({ ...active, id: result.agent.id });
      setNotice("Saved.");
      list.reload();
    } catch (caught) {
      setError(caught?.message ?? "Could not save the agent");
    } finally {
      setPending(false);
    }
  }

  async function toggleActive(agent) {
    setPending(true);
    try {
      await api.post(`/api/ai-agents/${agent.id}/toggle`, { isActive: !agent.isActive });
      list.reload();
    } catch (caught) {
      setError(caught?.message ?? "Could not change that");
    } finally {
      setPending(false);
    }
  }

  async function runPreview() {
    if (!active.id) return;
    setPending(true);
    setError(null);
    setPreview(null);
    try {
      const result = await api.post(`/api/ai-agents/${active.id}/preview`, {
        conversationId: previewConversation || undefined,
      });
      setPreview(result.preview);
    } catch (caught) {
      setError(caught?.message ?? "The preview failed");
    } finally {
      setPending(false);
    }
  }

  async function setPermission(tool, permission) {
    try {
      await api.patch(`/api/tools/${tool.id}`, { permission });
      tools.reload();
      list.reload();
    } catch (caught) {
      setError(caught?.message ?? "Could not change that tool");
    }
  }

  async function setToolActive(tool) {
    try {
      await api.patch(`/api/tools/${tool.id}`, { isActive: !tool.isActive });
      tools.reload();
    } catch (caught) {
      setError(caught?.message ?? "Could not change that tool");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI agents"
        description="An agent answers only conversations in AI mode. Tools are explicit: an agent can call nothing that is not listed here, and write tools are marked."
        actions={
          <>
            <Button variant="outline" onClick={newAgent}>
              <Plus />
              New agent
            </Button>
            <Button variant="ghost" onClick={list.reload}>
              <RefreshCw />
              Refresh
            </Button>
          </>
        }
      />

      <div
        className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
          provider === "mock"
            ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
            : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
        }`}
      >
        <Sparkles className="mt-0.5 size-4 shrink-0" />
        <p>
          Provider <span className="font-semibold">{provider}</span>
          {provider === "mock"
            ? " — replies are deterministic and no model is called. Set AI_API_KEY and AI_PROVIDER=openai on the server to use a real model."
            : " — OpenAI-compatible endpoint configured on the server."}
        </p>
      </div>

      <ErrorAlert error={error || list.error} />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="space-y-5">
          <SectionCard
            title="Agents"
            description={`${agents.length} ${agents.length === 1 ? "agent" : "agents"}`}
          >
            {list.loading && agents.length === 0 ? (
              <LoadingRows rows={3} />
            ) : agents.length === 0 ? (
              <EmptyState
                icon={Bot}
                title="No agent yet"
                description="Without an agent, AI-mode conversations stay unanswered."
              />
            ) : (
              <ul className="space-y-3">
                {agents.map((agent) => (
                  <li key={agent.id}>
                    <Card
                      className={`gap-0 py-0 ${agent.id === active.id ? "ring-primary/40" : ""}`}
                    >
                      <CardContent className="space-y-2.5 p-3.5">
                        <div className="flex items-start gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-600/15 dark:bg-indigo-500/15 dark:text-indigo-300">
                            <Bot className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold">{agent.name}</p>
                              <StatusBadge tone={agent.isActive ? "green" : "zinc"}>
                                {agent.isActive ? "On" : "Off"}
                              </StatusBadge>
                            </div>
                            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                              {agent.model || "server default"} · {agent.tools?.length ?? 0} tools
                            </p>
                          </div>
                          <Switch
                            checked={agent.isActive}
                            disabled={pending}
                            onCheckedChange={() => toggleActive(agent)}
                            aria-label={`Toggle ${agent.name}`}
                          />
                        </div>
                        {agent.description ? (
                          <p className="text-xs text-muted-foreground">{agent.description}</p>
                        ) : null}
                        <Button variant="outline" size="sm" onClick={() => edit(agent)}>
                          Edit
                        </Button>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Tool registry"
            description="What agents may call, and whether it writes"
            contentClassName="px-0"
          >
            {toolOptions.length === 0 ? (
              <p className="px-4 text-sm text-muted-foreground">
                No tools registered for this organization.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Tool</TableHead>
                    <TableHead>Permission</TableHead>
                    <TableHead className="text-right">Agents</TableHead>
                    <TableHead className="text-right">State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {toolOptions.map((tool) => (
                    <TableRow key={tool.id}>
                      <TableCell className="whitespace-normal">
                        <div className="flex items-start gap-2">
                          <Wrench className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{tool.name}</p>
                            <p className="text-xs text-muted-foreground">{tool.description}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={tool.permission}
                          onValueChange={(value) => setPermission(tool, value)}
                        >
                          <SelectTrigger
                            size="sm"
                            className="w-[100px]"
                            aria-label={`${tool.name} permission`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="read">read</SelectItem>
                            <SelectItem value="write">write</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {tool._count?.agents ?? 0}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setToolActive(tool)}
                        >
                          <StatusBadge tone={tool.isActive ? "green" : "zinc"}>
                            {tool.isActive ? "on" : "off"}
                          </StatusBadge>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard
            title={active.id ? "Edit agent" : "New agent"}
            description="One prompt, and the exact tools it may use"
          >
            <form className="space-y-4" onSubmit={save}>
              <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
                <div className="space-y-1.5">
                  <Label htmlFor="agent-name">Name</Label>
                  <Input
                    id="agent-name"
                    value={active.name}
                    onChange={(event) => setDraft({ ...active, name: event.target.value })}
                    placeholder="Front desk"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="agent-model">Model</Label>
                  <Input
                    id="agent-model"
                    value={active.model}
                    onChange={(event) => setDraft({ ...active, model: event.target.value })}
                    placeholder="gpt-4o-mini"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank for the server default.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="agent-description">Description</Label>
                <Input
                  id="agent-description"
                  value={active.description}
                  onChange={(event) => setDraft({ ...active, description: event.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="agent-prompt">System prompt</Label>
                <Textarea
                  id="agent-prompt"
                  className="min-h-[150px]"
                  value={active.systemPrompt}
                  onChange={(event) => setDraft({ ...active, systemPrompt: event.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  What the agent knows, how it speaks, and when to hand over.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="agent-temperature">Temperature</Label>
                  <Input
                    id="agent-temperature"
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={active.temperature}
                    onChange={(event) => setDraft({ ...active, temperature: event.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">0 is literal, 1 is loose.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="agent-tokens">Max tokens</Label>
                  <Input
                    id="agent-tokens"
                    type="number"
                    min="16"
                    max="8192"
                    value={active.maxTokens}
                    onChange={(event) => setDraft({ ...active, maxTokens: event.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label>Allowed tools</Label>
                <div className="mt-2 space-y-2">
                  {toolOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No tools available to grant.</p>
                  ) : (
                    toolOptions.map((tool) => (
                      <label
                        key={tool.id}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 transition-colors hover:bg-muted/50"
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={active.toolIds.includes(tool.id)}
                          onCheckedChange={() => toggleTool(tool.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="text-sm font-medium">{tool.name}</span>
                            <StatusBadge tone={tool.permission === "write" ? "amber" : "zinc"}>
                              {tool.permission}
                            </StatusBadge>
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {tool.description}
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <Label htmlFor="agent-active">Active</Label>
                  <p className="text-xs text-muted-foreground">
                    Only the active agent answers AI-mode conversations.
                  </p>
                </div>
                <Switch
                  id="agent-active"
                  checked={active.isActive}
                  onCheckedChange={(value) => setDraft({ ...active, isActive: value })}
                />
              </div>

              {notice ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <CircleCheck className="size-4" />
                  {notice}
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button type="submit" disabled={pending || !active.name.trim()}>
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  {active.id ? "Save agent" : "Create agent"}
                </Button>
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Preview" description="Drafts a reply without sending it">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="preview-conversation">Conversation</Label>
                <Select
                  value={previewConversation || "none"}
                  onValueChange={(value) =>
                    setPreviewConversation(value === "none" ? "" : value)
                  }
                >
                  <SelectTrigger id="preview-conversation" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No conversation</SelectItem>
                    {(conversations.data?.conversations ?? []).map((conversation) => (
                      <SelectItem key={conversation.id} value={conversation.id}>
                        {personName(conversation.contact)} —{" "}
                        {conversation.lastMessagePreview ?? "no preview"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Runs the prompt against the thread history. No message is sent.
                </p>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  onClick={runPreview}
                  disabled={pending || !active.id}
                >
                  <Sparkles />
                  Preview reply
                </Button>
              </div>

              {preview ? (
                <div className="space-y-2">
                  <div className="rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">
                    {preview.text}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {preview.provider} · {preview.steps} messages of history · preview only,
                    nothing was sent.
                  </p>
                </div>
              ) : null}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
