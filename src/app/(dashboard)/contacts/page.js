"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw, Search, Tag as TagIcon, X } from "lucide-react";
import { api } from "@/lib/api";
import { useResource } from "@/lib/useResource";
import { formatShortAge } from "@/lib/acuity";
import { formatDay, formatRelative, formatTime, personName, phoneOf } from "@/lib/format";
import {
  EmptyState,
  ErrorAlert,
  LoadingRows,
  PageHeader,
  PersonAvatar,
  SectionCard,
  StatusBadge,
} from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Contacts: the record behind a number. Tags are the shared vocabulary between a
 * contact and the automations that read them, so they are edited here.
 */

function contactStatus(lastSeenAt) {
  if (!lastSeenAt) return { tone: "zinc", label: "New" };
  const days = (Date.now() - new Date(lastSeenAt).getTime()) / 86400000;
  if (days <= 7) return { tone: "green", label: "Active" };
  if (days <= 30) return { tone: "amber", label: "Quiet" };
  return { tone: "zinc", label: "Dormant" };
}

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState({ name: "", email: "", locale: "" });
  const [newTag, setNewTag] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (tagFilter) params.set("tag", tagFilter);
    params.set("limit", "100");
    return `/api/contacts?${params.toString()}`;
  }, [search, tagFilter]);

  const list = useResource(query);
  const tags = useResource("/api/contacts/tags");
  const contacts = list.data?.contacts ?? [];

  const activeId = selectedId ?? contacts[0]?.id ?? null;

  useEffect(() => {
    if (!activeId) return undefined;
    let active = true;
    api
      .get(`/api/contacts/${activeId}`)
      .then((result) => {
        if (!active) return;
        setDetail(result.contact);
        setDraft({
          name: result.contact?.name ?? "",
          email: result.contact?.email ?? "",
          locale: result.contact?.locale ?? "",
        });
        setError(null);
      })
      .catch((caught) => active && setError(caught?.message ?? "Could not load that contact"));
    return () => {
      active = false;
    };
  }, [activeId]);

  async function save(event) {
    event.preventDefault();
    if (!activeId) return;
    setPending(true);
    setError(null);
    try {
      const result = await api.patch(`/api/contacts/${activeId}`, draft);
      setDetail((current) => ({ ...current, ...result.contact }));
      list.reload();
    } catch (caught) {
      setError(caught?.message ?? "Could not save");
    } finally {
      setPending(false);
    }
  }

  async function addTag(event) {
    event.preventDefault();
    const tag = newTag.trim();
    if (!tag || !activeId) return;
    setPending(true);
    try {
      const result = await api.post(`/api/contacts/${activeId}/tags`, { tag });
      setDetail((current) => ({ ...current, tags: result.contact.tags }));
      setNewTag("");
      list.reload();
      tags.reload();
    } catch (caught) {
      setError(caught?.message ?? "Could not add that tag");
    } finally {
      setPending(false);
    }
  }

  async function removeTag(tag) {
    if (!activeId) return;
    setPending(true);
    try {
      const result = await api.del(`/api/contacts/${activeId}/tags/${encodeURIComponent(tag)}`);
      setDetail((current) => ({ ...current, tags: result.contact.tags }));
      list.reload();
      tags.reload();
    } catch (caught) {
      setError(caught?.message ?? "Could not remove that tag");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Contacts"
        description="Everyone who has written to your numbers. Tags added here are visible to automations."
        actions={
          <>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, number or email"
                aria-label="Search contacts"
                className="pl-8"
              />
            </div>
            <Button variant="outline" onClick={list.reload}>
              <RefreshCw />
              Refresh
            </Button>
          </>
        }
      />

      <ErrorAlert error={error || list.error} />

      {(tags.data?.tags ?? []).length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip active={tagFilter === null} onClick={() => setTagFilter(null)}>
            All
            <span className="rounded-full bg-black/5 px-1.5 tabular-nums dark:bg-white/10">
              {contacts.length}
            </span>
          </FilterChip>
          {(tags.data?.tags ?? []).map((tag) => (
            <FilterChip
              key={tag}
              active={tagFilter === tag}
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
            >
              {tag}
            </FilterChip>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="gap-0 overflow-hidden py-0">
          {list.loading && contacts.length === 0 ? (
            <CardContent className="p-4">
              <LoadingRows rows={6} />
            </CardContent>
          ) : contacts.length === 0 ? (
            <CardContent className="p-4">
              <EmptyState
                icon={TagIcon}
                title="No contacts"
                description="Contacts are created when someone writes to a connected number."
              />
            </CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Contact</TableHead>
                  <TableHead className="hidden md:table-cell">Number</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead className="text-right">Threads</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => {
                  const status = contactStatus(contact.lastSeenAt);
                  const isActive = contact.id === activeId;
                  return (
                    <TableRow
                      key={contact.id}
                      data-state={isActive ? "selected" : undefined}
                      onClick={() => setSelectedId(contact.id)}
                      className="cursor-pointer"
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <PersonAvatar name={personName(contact)} className="size-8" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{personName(contact)}</p>
                            <p className="truncate text-xs text-muted-foreground md:hidden">
                              {phoneOf(contact)}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                        {phoneOf(contact)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          {(contact.tags ?? []).slice(0, 2).map((tag) => (
                            <StatusBadge key={tag} tone="indigo">
                              {tag}
                            </StatusBadge>
                          ))}
                          {(contact.tags ?? []).length > 2 ? (
                            <span className="text-xs text-muted-foreground">
                              +{contact.tags.length - 2}
                            </span>
                          ) : null}
                          {(contact.tags ?? []).length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {contact._count?.conversations ?? 0}
                      </TableCell>
                      <TableCell className="hidden text-right sm:table-cell">
                        <div className="flex items-center justify-end gap-2">
                          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                          <span className="w-16 text-xs text-muted-foreground tabular-nums">
                            {formatRelative(contact.lastSeenAt)}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        <div className="space-y-5">
          {!detail || detail.id !== activeId ? (
            <SectionCard title="Record">
              <p className="text-sm text-muted-foreground">Choose a contact to edit the record.</p>
            </SectionCard>
          ) : (
            <>
              <Card className="gap-0 overflow-hidden py-0">
                <CardContent className="flex items-center gap-3 p-4">
                  <PersonAvatar name={personName(detail)} className="size-11" />
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{personName(detail)}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {detail.waId}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <SectionCard title="Record">
                <form className="space-y-4" onSubmit={save}>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-name">Name</Label>
                    <Input
                      id="contact-name"
                      value={draft.name}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                      placeholder={detail.profileName ?? "Add a name"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-email">Email</Label>
                    <Input
                      id="contact-email"
                      type="email"
                      value={draft.email}
                      onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-locale">Locale</Label>
                    <Input
                      id="contact-locale"
                      value={draft.locale}
                      onChange={(event) => setDraft({ ...draft, locale: event.target.value })}
                      placeholder="en-US"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      First seen {formatDay(detail.createdAt)} · {formatTime(detail.createdAt)}
                    </span>
                    <Button type="submit" size="sm" disabled={pending}>
                      {pending ? <Loader2 className="animate-spin" /> : null}
                      Save
                    </Button>
                  </div>
                </form>
              </SectionCard>

              <SectionCard title="Tags">
                <div className="flex flex-wrap gap-1.5">
                  {(detail.tags ?? []).length === 0 ? (
                    <span className="text-sm text-muted-foreground">No tags yet.</span>
                  ) : (
                    (detail.tags ?? []).map((tag) => (
                      <StatusBadge key={tag} tone="indigo" className="pr-1">
                        {tag}
                        <button
                          type="button"
                          aria-label={`Remove tag ${tag}`}
                          disabled={pending}
                          onClick={() => removeTag(tag)}
                          className="ml-0.5 grid size-4 place-items-center rounded-full hover:bg-indigo-600/10"
                        >
                          <X className="size-3" />
                        </button>
                      </StatusBadge>
                    ))
                  )}
                </div>
                <form className="mt-3 flex gap-2" onSubmit={addTag}>
                  <Input
                    value={newTag}
                    onChange={(event) => setNewTag(event.target.value)}
                    placeholder="refund, vip, awaiting-photo"
                    aria-label="New tag"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={pending || !newTag.trim()}
                  >
                    <Plus />
                    Add
                  </Button>
                </form>
              </SectionCard>

              <SectionCard title="Threads" contentClassName="px-0">
                {(detail.conversations ?? []).length === 0 ? (
                  <p className="px-4 text-sm text-muted-foreground">
                    No conversations recorded.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {(detail.conversations ?? []).map((conversation) => (
                      <li key={conversation.id}>
                        <Link
                          href="/inbox"
                          className="block px-4 py-3 transition-colors hover:bg-muted/60"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">
                              {conversation.phoneNumber?.displayPhoneNumber ?? "number"}
                            </span>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {formatShortAge(conversation.lastMessageAt)}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-sm">
                            {conversation.lastMessagePreview || "No preview"}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "border bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
