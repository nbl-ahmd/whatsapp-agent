---
version: 1
slug: "src-app-dashboard-layout-js"
primary_target: "src/app/(dashboard)/layout.js"
related_targets: ["src/app/(dashboard)/inbox/page.js","src/app/(dashboard)/dashboard/page.js","src/app/(dashboard)/contacts/page.js","src/app/(dashboard)/automations/page.js","src/app/(dashboard)/ai-agents/page.js","src/app/(dashboard)/whatsapp/page.js","src/app/(dashboard)/logs/page.js","src/app/(dashboard)/settings/page.js","src/app/(dashboard)/integrations/page.js","src/app/login/page.js"]
---

# Surface brief — Operator desk

## Scope

The signed-in web app: shell, Inbox, Contacts, Automations, AI Agents, WhatsApp,
Integrations, Logs, Settings, plus the signed-out sign-in screen. Mode: **Operate**
(an internal operator running client WhatsApp accounts, first thing in the morning,
on a laptop, under office light, with a queue already waiting).

## Audience and job

One or two people run several client numbers. Their job is to find the conversations
where a promise to a customer is at risk, answer them, and hand the rest back to the
AI with confidence. They work top-down, fast, many times a day.

## Action

Open the desk, read the strip in one scan, take over the worst row, reply, stamp it.
Everything else (contacts, automations, agents, connection health) supports that loop.

## Content and proof

Real product data only: conversations with mode (ai / human / paused), status,
unread state, last message, assigned operator, phone number and provider mode,
automation runs with condition results, webhook events, tool permissions. No invented
benchmarks, customers, or pricing. Demo tenants are labelled as demo.

## Constraints

Tenant identity comes from the session token, never the URL. Meta secrets never reach
the browser. Every screen must work with the simulator provider and the mock AI
provider, so nothing on screen depends on paid credentials. Keyboard reachable,
visible focus, 390px wide without horizontal scrolling.

## Chosen direction

**Triage Strip** — hospital triage boards and acuity tags. The queue is ranked by who
needs a person, and the colour of the tag is the promise. Memorable moment: **the
acuity step** — when a row crosses a threshold (a human-mode conversation goes
unanswered, a refund intent lands), its tag steps up and the row moves to its new rank
in one 180ms step, while the legend ruler above the strip never moves.

## Unresolved

Whether paused conversations outrank AI-held ones. Taken as: paused ranks above AI-held,
because a person stopped it for a reason.

## Direction contract

THESIS: The desk is a triage board, not an inbox table. Rows are ranked by who needs a
person, and each row's acuity tag is a promise with a colour; the neutral "newest first"
list where every row looks equally urgent is refused.

OWN-WORLD: Clinical whiteboard paper #FBFAF7 under one dark ink bar #14181C. Four
semantic acuity inks only — critical #C2311E, watch #C07A0C, holding #1D6B4E, info
#1F4E8C — carried as solid tag blocks with a level number, never as decorative pills.
Barlow for interface text, Barlow Condensed for tags, numerals and column rules;
4px rule grid; handover notes set on ruled lines.

STORY: Within one scan the operator knows which conversations have broken a promise,
who owns each, and what happens next; they take one over, reply, and the strip
re-ranks under their hands.

FIRST VIEWPORT: A dark bar carrying org, number health and today's promise counters;
beneath it the acuity legend as a fixed ruler; the ranked strip takes the left two
thirds — a 44px tag block, sender, last line, and a right-hand vitals column of age,
handover count and owner — while the selected conversation's handover note and pinned
composer occupy the right third at 380px.

FORM: Hospital triage boards and acuity tags, the ground the roll dealt as
IMPECCABLE'S PICK, second on the ranked list of seven. seed:02b38808a78f9a59

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
