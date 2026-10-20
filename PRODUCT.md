# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: an internal operator on a small team that runs WhatsApp automation for
several client businesses from one login. Their situation is a shared work queue
that moves all day; their job is to triage what the AI could not finish and keep
clients' automations healthy without touching Meta tooling.

Concretely they switch between client organizations (tenants), scan for
conversations where someone asked for a human, read the recent thread, reply, and
then hand the conversation back to the AI. Secondary work: keeping an eye on the
AI answering correctly, fixing an automation that misfired, and confirming that
the WhatsApp number is still connected.

Secondary audience (later phase, not the design target now): a client business
owner who self-onboards and monitors only their own organization.

## Product Purpose

A multi-tenant platform that lets a team run WhatsApp conversations on the Meta
WhatsApp Cloud API: an AI agent answers inbound messages and uses tools to act,
automations react to events, and a human operator can take over any conversation
at any time.

Success for the operator: they can tell at a glance which conversations need a
human, act on one in seconds, and can see why the system did what it did.
Success for the product: the loop `customer message -> automation -> AI/tool ->
outbound WhatsApp reply` runs without anyone touching the database or Meta's
dashboard.

## Positioning

One normalized internal event and message model sits between Meta's webhooks and
everything else, so automations, the AI agent, tools and the inbox are all driven
by the same events instead of provider JSON. The AI has no database or API access
of its own: every action it can take is an explicit, schema-validated tool with a
permission, which is what makes it safe to let it reply unsupervised.

## Operating Context

- Real workflow: Meta delivers a webhook -> the backend persists it -> a worker
  normalizes it -> automations run -> if the conversation is in `ai` mode the
  agent replies through the tool registry -> outbound goes through one messaging
  abstraction to the Meta Graph API.
- Conversations have exactly one responder: `ai`, `human`, or `paused`. Human
  take-over must stop the AI immediately.
- The team works across organizations, so tenant identity comes from the
  authenticated session and every query is tenant-scoped.
- Meta credentials are per phone number (access token, app secret, verify token)
  and are entered by an operator in the product, stored encrypted; the browser
  never sees a token again after it is saved.
- During development the operator has Meta *test* credentials and can only
  message approved test recipients. Local runs must still be exercisable without
  Meta at all, so a phone number can be switched to a simulator provider.
- Operators read dense lists and threads all day, often on a laptop, sometimes
  from a phone between other tasks.

## Capabilities and Constraints

In scope now (phases 3-5): sign-in and organization sessions; contacts and tags;
conversations, messages and the human inbox; the event-driven automation engine
with JSON workflow definitions and run history; the provider-neutral AI agent
with an internal tool registry; background processing behind a queue abstraction;
logs for webhook events, automation runs and audit.

Out of scope until explicitly asked: Meta Tech Provider enrollment and
production Embedded Signup, WhatsApp Flows, CRM/ecommerce/MCP production
integrations, billing, analytics beyond operational counts.

Confirmed technical constraints: Next.js frontend that never talks to the
database or Meta; standalone Express + Prisma/PostgreSQL backend; no secret ever
prefixed `NEXT_PUBLIC_`; webhook handling stays fast and idempotent; AI provider
is swappable (OpenAI-compatible or a local deterministic provider when no key is
set).

Terminology used with users: organization (not tenant/account), contact,
conversation, inbox, automation, AI agent, tool, handoff.

## Brand Commitments

No logo, palette or brand assets exist yet - nothing is binding. The product sits
on WhatsApp, so WhatsApp's own identity is a real-world fact of the domain and
should not be counterfeited (no Meta logo, no claim of official affiliation).

## Evidence on Hand

- Real, working code for phase 2 (webhook verification, normalization, outbound
  send) and a seeded dataset for two demo organizations (`org_acme`,
  `org_globex`) used by the tests.
- No real customers, testimonials, case studies, benchmarks or pricing exist.
  Future work must not invent them.

## Product Principles

1. One responder per conversation: AI and humans never answer at the same time.
2. Never trust the client for identity - organization scope comes from the session.
3. Every automated action is explainable after the fact: runs, events and audit
   rows are first-class, readable surfaces.
4. The operator's fastest path is triage, not configuration; configuration lives
   one level deeper and stays honest about what is connected.
5. Simplicity over abstraction: working behavior first, swappable seams only where
   a provider really varies (Meta, AI, integrations).

## Accessibility & Inclusion

No product-specific standard was set. Baseline expectations for an operator tool:
full keyboard reachability, visible focus, AA contrast in both light and dark
themes, no color-only status encoding, and reduced-motion support.
