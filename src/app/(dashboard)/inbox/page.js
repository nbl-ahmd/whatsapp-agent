"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  Headset,
  Inbox as InboxIcon,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  Smile,
  Paperclip,
  AtSign,
  FileText,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useResource } from "@/lib/useResource";
import { ACUITY, acuityOf, countByAcuity, formatShortAge, rankConversations } from "@/lib/acuity";
import { formatDay, personName, phoneOf, titleCase } from "@/lib/format";
import { useAuth } from "@/components/AuthProvider";
import {
  EmptyState,
  ModePill,
  PersonAvatar,
  PriorityBadge,
  StatusBadge,
} from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * The inbox: the ranked queue on the left, the live thread in the middle, and the
 * customer on the right. Ranking is acuity-first, then longest-waiting.
 */

const NO_MESSAGES = [];

function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);

  return matches;
}

const LEVELS = [1, 2, 3, 4];
const LEVEL_LABEL = { 1: "Needs", 2: "Waiting", 3: "AI", 4: "Closed" };

export default function InboxPage() {
  const { user } = useAuth();
  const narrow = useMediaQuery("(max-width: 767px)");

  const [level, setLevel] = useState(null);
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesFor, setMessagesFor] = useState(null);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const list = useResource("/api/conversations?limit=60", { refreshMs: 15000 });
  const conversations = useMemo(() => list.data?.conversations ?? [], [list.data]);
  const ranked = useMemo(() => rankConversations(conversations), [conversations]);
  const counts = useMemo(() => countByAcuity(conversations), [conversations]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return ranked.filter((conversation) => {
      if (level && acuityOf(conversation).level !== level) return false;
      if (mine && conversation.assignedUserId !== user?.id) return false;
      if (!needle) return true;
      const name = personName(conversation.contact).toLowerCase();
      return (
        name.includes(needle) ||
        String(conversation.lastMessagePreview ?? "").toLowerCase().includes(needle) ||
        String(conversation.contact?.waId ?? "").includes(needle)
      );
    });
  }, [ranked, level, mine, search, user?.id]);

  const activeId = selectedId ?? (narrow ? null : filtered[0]?.id ?? null);

  const loadThread = useCallback((conversationId) => {
    if (!conversationId) return;
    Promise.all([
      api.get(`/api/conversations/${conversationId}`),
      api.get(`/api/conversations/${conversationId}/messages?limit=80`),
    ])
      .then(([detailResult, messagesResult]) => {
        setDetail(detailResult.conversation);
        setMessages(messagesResult.messages ?? []);
        setMessagesFor(conversationId);
        setError(null);
      })
      .catch((caught) => setError(caught?.message ?? "Could not open that conversation"));
  }, []);

  useEffect(() => {
    if (!activeId) return undefined;
    loadThread(activeId);
    return undefined;
  }, [activeId, loadThread]);

  const act = useCallback(
    async (path, body) => {
      setBusy(true);
      setError(null);
      try {
        await api.post(path, body);
        list.reload();
        if (activeId) await loadThread(activeId);
      } catch (caught) {
        setError(caught?.message ?? "That action failed");
      } finally {
        setBusy(false);
      }
    },
    [list, loadThread, activeId],
  );

  async function sendReply(event) {
    event.preventDefault();
    const text = draft.trim();
    const hasAttachment = Boolean(attachment?.link?.trim());
    if ((!text && !hasAttachment) || !activeId) return;

    setBusy(true);
    setError(null);
    try {
      const payload = hasAttachment
        ? {
            type: attachment.type,
            media: {
              link: attachment.link.trim(),
              caption: text || undefined,
              filename: attachment.filename?.trim() || undefined,
            },
          }
        : { type: "text", text };
      const result = await api.post(`/api/conversations/${activeId}/messages`, payload);
      setDraft("");
      setAttachment(null);
      setMessages((current) => [...current, result.message]);
      setDetail((current) => (current ? { ...current, mode: "human", status: "pending" } : current));
      list.reload();
    } catch (caught) {
      setError(caught?.message ?? "The message did not send");
    } finally {
      setBusy(false);
    }
  }

  const selected =
    (detail && detail.id === activeId ? detail : null) ??
    conversations.find((row) => row.id === activeId) ??
    null;
  const selectedContact = selected?.contact ?? null;
  const selectedAcuity = selected ? acuityOf(selected) : ACUITY[4];
  const thread = messagesFor === activeId ? messages : NO_MESSAGES;
  const threadLoading = Boolean(activeId) && messagesFor !== activeId;
  const openCount = counts[1] + counts[2] + counts[3];

  const history = useMemo(
    () =>
      selected
        ? conversations.filter(
            (row) => row.contactId === selected.contactId && row.id !== selected.id,
          )
        : [],
    [conversations, selected],
  );

  const grouped = useMemo(() => {
    const byDay = [];
    for (const message of thread) {
      const day = formatDay(message.timestamp ?? message.createdAt);
      const last = byDay[byDay.length - 1];
      if (!last || last.day !== day) byDay.push({ day, messages: [message] });
      else last.messages.push(message);
    }
    return byDay;
  }, [thread]);

  const showList = !narrow || !selected;
  const showThread = !narrow || Boolean(selected);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted-foreground">
            {openCount} open · {counts[1]} need a person
          </p>
        </div>
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search conversations…"
            className="pl-8"
          />
        </div>
        <Button variant="outline" onClick={list.reload}>
          Refresh
        </Button>
      </div>

      <div className="flex h-[calc(100dvh-11.5rem)] min-h-0 overflow-hidden rounded-xl border bg-card">
        {showList ? (
          <section
            aria-label="Ranked queue"
            className="flex w-full min-w-0 flex-col md:max-w-[360px] md:shrink-0 md:border-r"
          >
            <div className="flex flex-wrap items-center gap-1 border-b px-2 py-2">
              <FilterChip active={!level} onClick={() => setLevel(null)} count={conversations.length}>
                All
              </FilterChip>
              {LEVELS.map((option) => (
                <FilterChip
                  key={option}
                  active={level === option}
                  tone={option}
                  onClick={() => setLevel(level === option ? null : option)}
                  count={counts[option]}
                >
                  {LEVEL_LABEL[option]}
                </FilterChip>
              ))}
              <button
                type="button"
                onClick={() => setMine((value) => !value)}
                className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  mine ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                Mine
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {list.loading && conversations.length === 0 ? (
                <div className="space-y-2 p-3">
                  {Array.from({ length: 7 }).map((_, index) => (
                    <Skeleton key={index} className="h-20 w-full rounded-lg" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon={InboxIcon}
                    title="Nothing here"
                    description={
                      level
                        ? "No conversation currently ranks this level. Clear the filter to see the whole queue."
                        : "No conversations yet. Send a message to the connected number."
                    }
                  />
                </div>
              ) : (
                <ul>
                  {filtered.map((conversation) => {
                    const acuity = acuityOf(conversation);
                    const isSelected = conversation.id === activeId;
                    return (
                      <li key={conversation.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(conversation.id)}
                          className={`flex w-full items-start gap-3 border-b border-l-2 px-3 py-3 text-left transition-colors ${
                            isSelected
                              ? "border-l-primary bg-indigo-50/60 dark:bg-indigo-500/10"
                              : "border-l-transparent hover:bg-muted/50"
                          }`}
                        >
                          <PersonAvatar name={personName(conversation.contact)} className="size-9" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold">
                                {personName(conversation.contact)}
                              </span>
                              {conversation.unreadCount > 0 ? (
                                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                                  {conversation.unreadCount}
                                </span>
                              ) : null}
                              <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                                {formatShortAge(conversation.lastMessageAt)}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-sm text-muted-foreground">
                              {conversation.lastMessagePreview || "No message preview"}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <StatusBadge tone="zinc">
                                <MessageCircle className="size-3" />
                                WhatsApp
                              </StatusBadge>
                              <PriorityBadge level={acuity.level} />
                              <ModePill mode={conversation.mode} />
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
              {filtered.length} shown · priority first, then longest waiting
            </div>
          </section>
        ) : null}

        {showThread ? (
          <section className="flex min-w-0 flex-1 flex-col" aria-label="Conversation">
            {!selected ? (
              <div className="grid flex-1 place-items-center p-6">
                <EmptyState
                  icon={MessageCircle}
                  title="Choose a conversation"
                  description="Pick a thread to read the customer's messages and reply."
                />
              </div>
            ) : (
              <>
                <header className="flex items-center gap-3 border-b px-4 py-3">
                  {narrow ? (
                    <Button variant="ghost" size="icon-sm" onClick={() => setSelectedId(null)} aria-label="Back to queue">
                      <ArrowLeft />
                    </Button>
                  ) : null}
                  <PersonAvatar name={personName(selectedContact)} className="size-9" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{personName(selectedContact)}</p>
                    <p className="truncate text-xs text-muted-foreground">{phoneOf(selectedContact)}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <PriorityBadge level={selectedAcuity.level} />
                    {selected.mode !== "human" ? (
                      <Button size="sm" disabled={busy} onClick={() => act(`/api/conversations/${selected.id}/mode`, { mode: "human" })}>
                        <Headset />
                        Take over
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(`/api/conversations/${selected.id}/mode`, { mode: "ai" })}>
                        <Bot />
                        Return to AI
                      </Button>
                    )}
                  </div>
                </header>

                {error ? (
                  <div className="flex items-center gap-2 border-b bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                    <CircleAlert className="size-4" />
                    {error}
                    <button type="button" className="ml-auto" onClick={() => setError(null)} aria-label="Dismiss">
                      <X className="size-4" />
                    </button>
                  </div>
                ) : null}

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                  {threadLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-16 w-2/3 rounded-2xl" />
                      <Skeleton className="ml-auto h-12 w-1/2 rounded-2xl" />
                      <Skeleton className="h-20 w-3/4 rounded-2xl" />
                    </div>
                  ) : thread.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No messages stored for this conversation.
                    </p>
                  ) : (
                    grouped.map((group) => (
                      <div key={group.day} className="space-y-3">
                        <p className="text-center text-xs font-medium text-muted-foreground">{group.day}</p>
                        {group.messages.map((message) => (
                          <MessageBubble key={message.id} message={message} />
                        ))}
                      </div>
                    ))
                  )}
                </div>

                <div className="border-t bg-card">
                  {selected.mode !== "human" ? (
                    <div className="flex items-center gap-2 border-b bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                      <Sparkles className="size-3.5" />
                      The AI is handling this thread. Replying takes it over.
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => act(`/api/conversations/${selected.id}/mode`, { mode: "human" })}
                        className="ml-auto font-semibold underline underline-offset-2"
                      >
                        Take over
                      </button>
                    </div>
                  ) : null}

                  <form onSubmit={sendReply} className="space-y-2 p-3">
                    {attachment ? (
                      <div className="grid gap-2 rounded-lg border bg-muted/30 p-2.5 sm:grid-cols-[130px_minmax(0,1fr)]">
                        <div className="space-y-1">
                          <Label htmlFor="attach-type" className="text-xs">
                            Attachment
                          </Label>
                          <Select
                            value={attachment.type}
                            onValueChange={(next) => setAttachment({ ...attachment, type: next })}
                          >
                            <SelectTrigger id="attach-type" size="sm" className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="image">Image</SelectItem>
                              <SelectItem value="document">Document</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="attach-link" className="text-xs">
                            Media URL
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              id="attach-link"
                              value={attachment.link}
                              onChange={(event) =>
                                setAttachment({ ...attachment, link: event.target.value })
                              }
                              placeholder="https://cdn.example.com/file.jpg"
                            />
                            {attachment.type === "document" ? (
                              <Input
                                value={attachment.filename}
                                onChange={(event) =>
                                  setAttachment({ ...attachment, filename: event.target.value })
                                }
                                placeholder="filename.pdf"
                                className="w-[150px]"
                              />
                            ) : null}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Remove attachment"
                              onClick={() => setAttachment(null)}
                            >
                              <X />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <Textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") sendReply(event);
                      }}
                      placeholder={
                        attachment
                          ? "Add a caption (optional)…"
                          : `Reply as ${user?.name ?? "operator"}…`
                      }
                      className="min-h-20 resize-none"
                    />
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant={attachment ? "secondary" : "ghost"}
                        size="icon-sm"
                        aria-label="Attach image or document"
                        onClick={() =>
                          setAttachment(
                            attachment ? null : { type: "image", link: "", filename: "" },
                          )
                        }
                      >
                        <Paperclip />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Emoji">
                        <Smile />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Mention">
                        <AtSign />
                      </Button>
                      <span className="ml-1 hidden text-xs text-muted-foreground sm:inline">
                        {selected.mode === "human" ? "Replying as you" : "Sending switches to human mode"}
                      </span>
                      <Button
                        type="submit"
                        size="sm"
                        className="ml-auto"
                        disabled={busy || (!attachment?.link?.trim() && !draft.trim())}
                      >
                        <Send />
                        {busy ? "Sending…" : "Send"}
                      </Button>
                    </div>
                  </form>
                </div>
              </>
            )}
          </section>
        ) : null}

        {selected ? (
          <aside className="hidden w-[320px] shrink-0 flex-col overflow-y-auto border-l xl:flex" aria-label="Customer">
            <div className="flex flex-col items-center gap-2 border-b px-4 py-5 text-center">
              <PersonAvatar name={personName(selectedContact)} className="size-14 text-base" />
              <div>
                <p className="text-base font-semibold">{personName(selectedContact)}</p>
                <p className="text-xs text-muted-foreground">{phoneOf(selectedContact)}</p>
              </div>
              <div className="flex gap-2">
                <PriorityBadge level={selectedAcuity.level} />
                <ModePill mode={selected.mode} />
              </div>
            </div>

            <div className="space-y-3 border-b px-4 py-4 text-sm">
              <DetailRow icon={Phone} label="WhatsApp" value={phoneOf(selectedContact)} />
              {selectedContact?.createdAt ? (
                <DetailRow icon={MapPin} label="Customer since" value={new Date(selectedContact.createdAt).toLocaleDateString([], { month: "short", year: "numeric" })} />
              ) : null}
              <DetailRow icon={MessageCircle} label="Last move" value={`${formatShortAge(selected.lastMessageAt)} ago`} />
            </div>

            <div className="space-y-2 border-b px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Assigned agent</p>
                {!selected.assignedUser && user ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    disabled={busy}
                    onClick={() => act(`/api/conversations/${selected.id}/assign`, { userId: user.id })}
                  >
                    Assign to me
                  </button>
                ) : (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    disabled={busy}
                    onClick={() => act(`/api/conversations/${selected.id}/assign`, { userId: null })}
                  >
                    {selected.assignedUser ? "Unassign" : "Assign"}
                  </button>
                )}
              </div>
              {selected.assignedUser ? (
                <div className="flex items-center gap-2 rounded-lg border p-2">
                  <PersonAvatar name={selected.assignedUser.name} className="size-8" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{selected.assignedUser.name}</p>
                    <p className="truncate text-xs text-muted-foreground">Agent</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nobody owns this thread yet.</p>
              )}
            </div>

            <div className="space-y-2 border-b px-4 py-4">
              <p className="text-sm font-semibold">Status</p>
              <div className="grid gap-1.5">
                {["open", "pending", "closed"].map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={busy}
                    onClick={() => act(`/api/conversations/${selected.id}/status`, { status })}
                    className={`flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                      selected.status === status
                        ? "border-primary/40 bg-primary/5 font-medium text-primary"
                        : "hover:bg-muted"
                    }`}
                  >
                    {titleCase(status)}
                    {selected.status === status ? <Check className="size-4" /> : null}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 border-b px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Tags</p>
              </div>
              {(selectedContact?.tags ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No tags on this contact.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(selectedContact?.tags ?? []).map((tag) => (
                    <StatusBadge key={tag} tone="indigo">
                      {tag}
                    </StatusBadge>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 px-4 py-4">
              <p className="text-sm font-semibold">Previous conversations</p>
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground">First conversation with this customer.</p>
              ) : (
                <ul className="space-y-1.5">
                  {history.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(row.id)}
                        className="flex w-full items-center gap-2 rounded-lg border p-2 text-left transition-colors hover:bg-muted"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-muted-foreground">
                            {row.lastMessagePreview || "No preview"}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatShortAge(row.lastMessageAt)} ago</p>
                        </div>
                        <PriorityBadge level={acuityOf(row).level} showDot={false} />
                        <ChevronRight className="size-3.5 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function FilterChip({ active, tone, count, onClick, children }) {
  const toneRing =
    tone === 1
      ? "data-[active=true]:bg-rose-50 data-[active=true]:text-rose-700"
      : tone === 2
        ? "data-[active=true]:bg-amber-50 data-[active=true]:text-amber-800"
        : tone === 3
          ? "data-[active=true]:bg-indigo-50 data-[active=true]:text-indigo-700"
          : "data-[active=true]:bg-primary data-[active=true]:text-primary-foreground";
  return (
    <button
      type="button"
      data-active={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted ${toneRing}`}
    >
      {children}
      <span className="rounded-full bg-black/5 px-1.5 tabular-nums dark:bg-white/10">{count}</span>
    </button>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm">{value}</p>
      </div>
    </div>
  );
}

function MessageBubble({ message }) {
  const outbound = message.direction === "outbound";
  const media = message.media ?? null;
  const mediaLink = typeof media?.link === "string" ? media.link : null;
  const caption = message.text ?? null;

  return (
    <div className={`flex items-end gap-2 ${outbound ? "justify-end" : "justify-start"}`}>
      {!outbound ? (
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
          <MessageCircle className="size-3.5" />
        </span>
      ) : null}
      <div className="max-w-[75%]">
        <div
          className={`space-y-2 rounded-2xl px-3.5 py-2 text-sm ${
            outbound
              ? "rounded-br-md bg-primary text-primary-foreground"
              : "rounded-bl-md border bg-card"
          }`}
        >
          {message.type === "image" && mediaLink ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaLink}
              alt={media?.caption || "Image attachment"}
              className="max-h-64 rounded-lg object-contain"
            />
          ) : null}

          {message.type === "document" && mediaLink ? (
            <a
              href={mediaLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 underline underline-offset-2"
            >
              <FileText className="size-4 shrink-0" />
              {media?.filename || "Document"}
            </a>
          ) : null}

          {caption ? <p className="whitespace-pre-wrap">{caption}</p> : null}

          {!caption && !mediaLink ? (
            <p className="opacity-80">[{message.type} message]</p>
          ) : null}

          {message.error ? (
            <p className={`text-xs ${outbound ? "text-primary-foreground/80" : "text-rose-600"}`}>
              {message.error}
            </p>
          ) : null}
        </div>
        <div
          className={`mt-1 flex items-center gap-1 text-[11px] text-muted-foreground ${
            outbound ? "justify-end" : ""
          }`}
        >
          {formatDay(message.timestamp ?? message.createdAt)} ·{" "}
          {new Date(message.timestamp ?? message.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
          {outbound ? (
            message.status === "failed" ? (
              <CircleAlert className="size-3 text-rose-500" />
            ) : message.status === "read" ? (
              <CheckCheck className="size-3 text-sky-500" />
            ) : (
              <Check className="size-3" />
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
