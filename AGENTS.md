# WhatsApp Automation SaaS

## Project Goal

Build a multi-tenant WhatsApp automation SaaS using the Meta WhatsApp Cloud API.

The MVP must work with a Meta WhatsApp test number first.

The platform should eventually support:

* WhatsApp Cloud API
* inbound/outbound messaging
* webhooks
* conversations
* contacts
* human inbox
* automation workflows
* AI agents
* tool calling
* WhatsApp Flows
* CRM integrations
* ecommerce integrations
* MCP-compatible tools
* analytics
* client self-onboarding through Meta Embedded Signup later

Do NOT implement Tech Provider enrollment or production Embedded Signup unless explicitly requested in a later phase.

---

# Architecture

Use a multi-tenant architecture from the beginning.

Core flow:

```text
WhatsApp
  ↓
Meta Cloud API
  ↓
Webhook
  ↓
Webhook Event
  ↓
Tenant Resolution
  ↓
Contact
  ↓
Conversation
  ↓
Message
  ↓
Automation Engine
  ↓
AI Agent / Tool
  ↓
Outbound Message Service
  ↓
Meta Cloud API
  ↓
WhatsApp
```

Keep Meta-specific implementation isolated inside the WhatsApp integration layer.

The automation engine must operate on normalized internal events rather than raw Meta webhook payloads.

---

# Technology

Prefer the existing repository technology.

If starting from scratch:

* Next.js
* React
* Tailwind
* Node.js
* PostgreSQL
* Prisma or equivalent ORM
* Redis/BullMQ when background processing is needed
* JavaScript unless TypeScript is explicitly chosen
* OpenAI-compatible AI API

Do not add dependencies unnecessarily.

---

# Core Modules

The architecture should eventually contain:

```text
whatsapp/
webhooks/
contacts/
conversations/
messages/
automation/
ai/
tools/
integrations/
workers/
analytics/
auth/
```

Keep modules loosely coupled.

---

# Multi-Tenancy

Every business/customer using the SaaS is an Organization.

Important relationship:

```text
Organization
  ├── Users
  ├── WhatsApp Accounts
  ├── Phone Numbers
  ├── Contacts
  ├── Conversations
  ├── Messages
  ├── Automations
  ├── AI Agents
  ├── Tools
  └── Integrations
```

Never trust an organization/tenant ID supplied by the browser.

Derive tenant identity from authenticated context.

Every database query involving tenant-owned data must enforce tenant isolation.

---

# WhatsApp

Create a dedicated WhatsApp service.

It should eventually support:

```text
sendText()
sendImage()
sendDocument()
sendInteractive()
sendTemplate()
sendFlow()
getTemplates()
getPhoneNumber()
```

All outbound messages must pass through one outbound messaging abstraction.

Never call Meta Graph API directly from frontend code.

Never expose Meta access tokens to the browser.

Keep Meta API version/configuration centralized.

---

# Webhooks

Webhook endpoint:

```text
GET /api/webhooks/whatsapp
POST /api/webhooks/whatsapp
```

GET handles Meta webhook verification.

POST:

1. receive event
2. validate
3. persist raw event
4. resolve tenant
5. normalize event
6. persist message/event
7. trigger asynchronous processing
8. return quickly

Do not perform long AI inference synchronously inside the webhook request.

Webhook processing must be idempotent.

Repeated Meta webhook delivery must not create duplicate messages or duplicate automation executions.

---

# Internal Message/Event Model

Do not make the rest of the application depend on Meta's raw JSON.

Normalize incoming messages into an internal structure such as:

```js
{
  organizationId,
  channel: "whatsapp",
  phoneNumberId,
  contactId,
  conversationId,
  externalMessageId,
  type,
  text,
  media,
  interactive,
  timestamp,
  raw
}
```

Automation and AI operate on this normalized model.

---

# Conversations

Conversation modes:

```text
ai
human
paused
```

AI and human agents must never respond simultaneously.

Human takeover disables AI processing for that conversation until explicitly re-enabled.

---

# Automation Engine

Automations are event-driven.

Examples:

```text
MESSAGE_RECEIVED
FLOW_COMPLETED
CONVERSATION_STARTED
ORDER_CREATED
ORDER_UPDATED
```

Initial action types:

```text
send_message
send_template
send_flow
ai_agent
add_tag
remove_tag
assign_agent
set_variable
webhook
delay
handoff_human
```

Initial condition types:

```text
contains
equals
starts_with
variable_equals
contact_tag
AI intent
```

Use JSON workflow definitions.

Keep execution logic independent from the UI.

---

# AI Architecture

AI is a tool-using agent, not merely a chatbot.

Conceptually:

```text
Incoming Message
 ↓
AI Agent
 ↓
Tool Registry
 ├── CRM
 ├── Ecommerce
 ├── Calendar
 ├── WhatsApp
 └── MCP
 ↓
Tool Result
 ↓
AI
 ↓
Response
```

AI must not have unrestricted database or API access.

All actions must use explicit tools with schemas and validation.

Implement a provider-neutral AI abstraction.

Do not tightly couple the agent to one model provider.

---

# Tools

Use a common tool interface:

```text
name
description
input schema
permission
execute()
```

Initial internal tools may include:

```text
get_contact
update_contact
add_tag
get_conversation
send_whatsapp_message
handoff_to_human
```

Future tools:

```text
crm.*
ecommerce.*
calendar.*
erp.*
```

MCP should eventually map into the same tool abstraction.

Do not implement a complete MCP platform unless specifically requested.

---

# CRM

Use an adapter interface:

```text
findCustomer()
createCustomer()
updateCustomer()
addNote()
createLead()
```

The AI should use generic CRM tools rather than provider-specific logic.

---

# Ecommerce

Use an adapter interface:

```text
searchProducts()
getProduct()
getOrder()
listOrders()
createOrder()
cancelOrder()
```

Destructive operations require validation and, where appropriate, explicit user confirmation.

Transactional information must come from the ecommerce API rather than hallucinated/RAG data.

---

# WhatsApp Flows

Flows are structured UI experiences.

Use them for:

* forms
* bookings
* product selection
* checkout
* lead capture
* structured support

Flow completion must become an internal event such as:

```text
FLOW_COMPLETED
```

which can trigger automations.

---

# Database

Initial core entities:

```text
Organization
User
WhatsAppAccount
WhatsAppPhoneNumber
Contact
Conversation
Message
Automation
AutomationRun
AIAgent
Tool
Integration
WebhookEvent
AuditLog
```

Use foreign keys and appropriate indexes.

Sensitive credentials must never be stored in plaintext when persistent storage is used.

---

# Security

Never:

* expose API keys in frontend code
* expose Meta access tokens
* trust tenant IDs from requests
* allow arbitrary SQL/API execution by AI
* log credentials
* commit `.env`

Redact secrets from logs.

Validate external input.

Use authentication/authorization for all tenant APIs.

---

# Background Processing

Webhook handling must remain fast.

Prefer:

```text
Webhook
 ↓
Persist
 ↓
Queue
 ↓
Worker
 ↓
Automation
 ↓
AI
 ↓
Outbound Message
```

Use Redis/BullMQ if appropriate.

Keep queue functionality behind a service abstraction so local development can remain simple.

---

# UI

Initial navigation:

```text
Dashboard
Inbox
Contacts
Automations
AI Agents
Integrations
WhatsApp
Logs
Settings
```

Prioritize functionality over visual polish.

Do not spend excessive implementation time building elaborate visual editors during the MVP.

---

# Development Rules

1. Inspect existing code before changing it.
2. Do not rewrite working code unnecessarily.
3. Work only on the requested phase.
4. Keep changes scoped.
5. Reuse existing dependencies.
6. Avoid unnecessary abstractions.
7. Prefer simple working implementations.
8. Keep Meta-specific code isolated.
9. Keep AI provider code isolated.
10. Keep integrations behind adapters.
11. Test important business logic.
12. Run lint/build/tests after meaningful changes.
13. Fix errors before moving to the next phase.
14. Never claim something works without testing it.
15. If external credentials/configuration are missing, clearly identify what must be configured manually.

---

# Development Phases

## Phase 0

Project initialization and architecture.

## Phase 1

Database and multi-tenant foundation.

## Phase 2

WhatsApp Cloud API + webhook + send/receive.

## Phase 3

Contacts, conversations, messages and inbox.

## Phase 4

Automation engine.

## Phase 5

AI agent and internal tools.

## Phase 6

WhatsApp Flows.

## Phase 7

CRM/ecommerce adapters.

## Phase 8

MCP adapter architecture.

## Phase 9

Logs, analytics, security and hardening.

## Phase 10

Testing, documentation and production preparation.

## Phase 11

Meta Embedded Signup/client self-onboarding.

Do not skip ahead unless explicitly instructed.

---

# MVP Definition of Done

The first major vertical slice must support:

```text
Customer
 ↓
WhatsApp test number
 ↓
Meta
 ↓
Webhook
 ↓
Database
 ↓
Contact
 ↓
Conversation
 ↓
Message
 ↓
Automation
 ↓
AI
 ↓
Tool (optional)
 ↓
Outbound WhatsApp message
 ↓
Customer
```

Also support:

```text
Customer requests human
 ↓
AI handoff
 ↓
Conversation becomes human mode
 ↓
Agent replies from Inbox
```

The application must be usable with a real Meta WhatsApp test number before production/provider features are attempted.

---

# Agent Behavior

When asked to implement a phase:

1. Inspect only the relevant repository files.
2. Check existing implementation.
3. Produce a short plan.
4. Implement the phase.
5. Run tests/lint/build as appropriate.
6. Fix failures.
7. Give a concise summary.
8. State any manual configuration required.

Do not implement future phases unless necessary for the current phase.

Do not generate large explanations when code changes are the primary task.
