# CONTEXT — resume notes

Handoff for a fresh session. Read this first, then `AGENTS.md` (rules + phases),
`PRODUCT.md` (product truth), and `DESIGN.md` (the locked visual direction). This
file is for *state*: what exists, what is verified, what is next. The history of
completed work is in `CHECKPOINTS.md`.

Last updated: 2026-10-20.

---

## 1. What this is

Multi-tenant WhatsApp automation SaaS on the Meta WhatsApp Cloud API. An AI agent
answers inbound messages and acts through explicit tools; automations react to
normalized events; a human operator can take over any conversation from the inbox.

Monorepo, two apps:

- **Frontend** — Next.js 16 (App Router, Turbopack), React 19, Tailwind v4, at the
  repo root (`src/`). Never talks to the database or to Meta.
- **Backend** — standalone Express 5 + Prisma 7 + PostgreSQL in `server/`. Owns
  all Meta calls, the webhook, the queue, the automation engine and the AI agent.

Core flow: Meta webhook → persist raw → resolve tenant (from the token/phone
number, never the client) → normalize → contact/conversation/message → queue →
automation + AI (tools) → single outbound messaging service → Meta Graph API.

---

## 2. Resume commands

```bash
# Infra (Postgres + Redis)
docker compose up -d

# install (if node_modules missing)
npm install && npm --prefix server install

# database
npm run db:migrate       # or db:push for a scratch DB
npm run db:seed          # demo orgs + data

# run (two terminals)
npm run dev              # Next.js on http://localhost:3000
npm run dev:api          # Express API on http://localhost:4000

# verify before moving on
npm run lint             # eslint src  (must be clean)
npm run build            # next build  (must pass)
npm test                 # node --test, server/tests  (currently 51 pass)
```

**Demo logins** (from `server/prisma/seed.mjs`; password is the same for all):

- `owner@acme.test` / `password123` (org `org_acme`)
- `agent@acme.test` / `password123`
- `owner@globex.test` / `password123` (org `org_globex`)

Nothing needs Meta credentials or an AI key to run: a phone number can be
`providerMode = "simulator"`, and the AI provider is `mock` (deterministic) when
`AI_API_KEY` is unset.

**This environment (2026-10-19).** Docker is **not** installed here, so the
`docker compose up -d` step is not available. Postgres was already reachable and
the API was already listening on `http://localhost:4000` (`/health` → ok). If the
API is down, start it with `npm run dev:api`. The web app runs with `npm run dev`.

---

## 3. Verified state (2026-10-20, WhatsApp messaging + BYOK)

- `npm run lint` → clean.
- `npm run build` → succeeds; all 12 routes prerender.
- `npm test` → **58/58** pass (auth, automation, crypto, database integration, messaging,
  pipeline integration, http, tenant scoping, tools, settings, whatsapp
  normalize/verify/integration).
- Manual HTTP E2E on a throwaway org: save credentials → webhook handshake with
  the stored verify token → test AI → send image and template → document reply.
- `impeccable detect` → **0 findings** on `/login` at 1280×800 and 390×844, and on
  `src` (last run 2026-10-19; UI changes since are form-only).
- In-page audit of all nine authenticated routes (viewport 1000px, 2026-10-19): no
  functional text under 11px, no horizontal overflow, no console errors, **no AA
  contrast failures**. (The detector cannot scan authenticated URLs; this is the
  substitute.)

Working tree is **clean** as of `2817cbc`. Phases 1–5, the frontend and the docs
are committed in four logical commits (see `CHECKPOINTS.md`, 2026-10-20).

---

## 4. Phases — where things stand

| Phase | Status |
| --- | --- |
| 0 Project init | done |
| 1 DB + multi-tenancy | done — org scoping via `server/src/lib/tenant.js`, auth middleware in `server/src/middleware/auth.js`, every query tenant-scoped |
| 2 WhatsApp Cloud API + webhook | done — verify/signature, persist raw event, idempotent processing, send/receive, simulator provider; outbound text/image/document/template/interactive; inbound media is metadata only |
| 3 Contacts, conversations, messages, inbox | done — services + controllers + the web app pages; inbox supports image/document attachments |
| 4 Automation engine | done — JSON workflows, conditions/actions, run history, queue behind `server/src/lib/queue.js` |
| 5 AI agent + internal tools | done — provider-neutral (`ai/provider.js`: openai-compatible or mock), tool registry with schemas/permissions (`tools/registry.js`), agent loop (`ai/agent.js`); BYOK config per organization |
| 6 WhatsApp Flows | not started (out of scope until asked) |
| 7 CRM/ecommerce/MCP adapters | interface only — `services/integrations/index.js`, routes present; **Integrations page shows the adapter contract and connection records, but no provider adapters are registered** |
| 8 MCP | not started |
| 9 Logs/analytics/hardening | partial — logs + audit + dashboard counts exist |
| 10 Testing/docs/prod prep | partial — tests exist; README + this doc |
| 11 Embedded Signup | not started (explicitly deferred) |

Frontend pages (`src/app/(dashboard)/`): Dashboard, Inbox, Contacts, Automations,
AI Agents, WhatsApp, Logs, Settings are implemented; **Integrations** renders the
adapter contract and connection records but has no real providers behind it.

---

## 5. The visual direction is locked

**Triage Strip** (hospital triage boards and acuity tags). Full contract and tokens
in `DESIGN.md`; the brief is `.impeccable/surfaces/`. The docket and mocks are in
`.impeccable/` (`decision-payload.json`, `mocks/decision/`).

Do not restyle the app to another world — the world is chosen and the shell, tokens
and every page are already cut from it. Small, in-world refinements are welcome;
a re-skin is not.

Two token values moved for AA contrast in the 2026-10-19 pass and must not be
reverted: `--watch` `#9A5B00` (was `#C07A0C`) and `--ink-3` `#656C73` (was
`#6C737A`). Two house rules also came out of it: **functional text is ≥11px**, and
**no kicker/eyebrow above a heading**. All three are recorded in `DESIGN.md`.

The "acuity" ranking is derived in `src/lib/acuity.js` from what the backend already
records (mode, unread, ownership, age). It is not stored. Within one level the
**longest-waiting promise ranks first**.

---

## 6. Frontend map

- `src/lib/api.js` — bearer-token client, unwraps `{ data }`, 401 clears the session.
- `src/lib/session.js` — the one place the browser token lives (never an org id).
- `src/components/AuthProvider.js` — session context via `useSyncExternalStore`,
  `/api/auth/me` verification, sign in / register / sign out / change password.
- `src/lib/useResource.js` — read hook; loading is derived from whether the held
  data belongs to the current path.
- `src/lib/acuity.js` — acuity levels, ranking, counts, short ages.
- `src/components/ui.js` — Tag, AcuityTag, AcuityBlock, Ruler, PageHead, Field,
  Empty, Banner, Stat, Panel, Skeleton.
- `src/app/globals.css` — every visual token and component style for the world.
- `src/config/navigation.js` — the primary nav.

Server endpoints (all under `/api`, tenant-scoped): `auth`, `organizations`,
`settings` (BYOK credentials + AI test), `dashboard`, `contacts`, `conversations`,
`automations`, `ai-agents`, `tools`, `integrations`, `logs`, `whatsapp` (incl.
`numbers`, `accounts`, `templates`, `messages`, `webhook-status`), and the public
`webhooks/whatsapp`.

---

## 7. What recent sessions changed

### 2026-10-20 · WhatsApp messaging + BYOK

Goal: finish the messaging path and stop requiring Meta/AI env configuration.

1. **BYOK credentials.** `OrganizationSettings` (migration
   `20261020130000_add_organization_settings`) stores Meta access token, app
   secret, verify token, Graph version/base URL and AI provider/key/base/model.
   Secrets are AES-GCM encrypted; the API returns only flags and sources.
   `/api/settings` is admin-write, authenticated-read; `/test-ai` runs one tiny
   completion. Env remains the fallback.
2. **Runtime wiring.** Webhook verification and HMAC validation consult org
   settings and account-level credentials; AI calls and token resolution prefer
   org settings. No credentials are returned to the browser.
3. **Messaging.** `services/messages/outbound.js` is now the one dispatcher for
   text, image, document, template and interactive messages. The inbox can send
   image/document attachments and renders outbound/inbound media metadata; the
   WhatsApp page can send image/document/template tests. `GET
   /api/whatsapp/templates` lists approved templates.
4. **Security fix.** The browser can no longer write arbitrary
   `Organization.settings` through `PATCH /api/organizations`.

### 2026-10-19 · Design pass (craft floor)

Goal: run the desk and improve the UI with impeccable, without re-skinning.

1. **Detector fixes.** 10px captions and an 8px acuity stamp raised to the 11px
   floor; `--watch` darkened for white-label contrast; placeholders use `--ink-3`;
   the banner's 3px left rule replaced by a solid tone square (the `side-tab`
   anti-pattern), plus the outbound bubble and login error.
2. **Authenticated contrast audit.** `--ink-3` failed on the tinted `--paper-2`
   (table heads, muted notes) → darkened to `#656C73`. Hard-coded grays in
   `.tag[data-level="4"]` / `.acuity-block` now read `var(--ink-3)`.
3. **Eyebrows removed** from `PageHead` and every page + login (craft-floor ban);
   the dashboard date moved under the `h1`.
4. **Ranking bug fixed.** `rankConversations` said oldest-first in copy but sorted
   newest-first; now longest-waiting-first within a level.
5. **Browser surfaces** themed (selection, caret, thin scrollbars); a 1px press
   step on buttons.
6. `DESIGN.md` updated; `CHECKPOINTS.md` added.

### Earlier · Frontend green + design contract

Goal: get the frontend green after the visual build, then document it.

1. **Cleared all 12 lint errors.** The React 19 / `eslint-plugin-react-hooks`
   `set-state-in-effect` rule was failing on the "seed state after data arrives"
   pattern. Replaced it everywhere with derived state / event handlers:
   - `AuthProvider.js` — session now read through `useSyncExternalStore`; the
     `/me` verdict is keyed by token, set only inside promise callbacks.
   - `useResource.js` — rewrote to derive `loading`/`data`/`error` from the path
     the held state was fetched for.
   - `AppShell.js` — the mobile sheet closes on link select and sign-out instead
     of on a pathname effect.
   - `contacts`, `inbox`, `automations`, `whatsapp`, `settings`, `ai-agents`
     pages — first-row auto-selection, detail/thread resets, default number and
     the org-name field are now derived, not effect-seeded.
   - `logs` — escaped an apostrophe in JSX copy.
2. **Fixed a real bug found during the refactor:** on the AI Agents page the
   "New agent" button was immediately re-filled by the auto-select effect (the
   blank draft had no `id`). The form now follows an explicit draft, so a new
   agent stays blank.
3. **Added `DESIGN.md`** — the direction contract, tokens, typography, the acuity
   language, motion, accessibility, and provenance for every shipping asset.
4. Verified: lint clean, `next build` passes, `npm test` 51/51.

### Behaviour deltas from the refactor (intentional, worth knowing)

- `useResource` returns `data: null` while a *new* path is loading (before it kept
  the previous data). Background `refreshMs` re-fetches still keep the last data.
  Pages already treat `data ?? []`, so lists show the skeleton then fill.
- The inbox thread shows its loading skeleton whenever the loaded thread does not
  belong to the active conversation (`messagesFor !== activeId`), rather than via a
  `threadState` flag that is now removed.
- Contacts detail now guards on `detail.id === activeId`, so a stale record can't
  linger for a selection that changed.

---

## 8. Next actions (suggested, in order)

1. **Inbound media proxy.** Media ids arrive and expire; add a tenant-scoped
   `GET` that resolves the Graph media URL with the stored token so the inbox can
   render images/documents instead of `[image message]`.
2. **Template picker.** The API can list approved templates, but the WhatsApp test
   panel still takes name/language by hand — wire the list into a picker.
3. **Human visual pass on the running app.** Sign in as `owner@acme.test` and walk
   Dashboard → Inbox → Contacts → Automations → AI Agents → WhatsApp → Settings →
   Logs at 1440px, ~1040px and 390px. The new Settings card and inbox attachment
   row have not been seen by a human yet.
4. **Refresh `README.md`.** It still says "Phase 2", points at deleted components
   (`SidebarNav`, `BackendStatus`, `config/modules.js`) and describes a
   Vercel/Render split that no longer matches the repo.
5. **Integrations (phase 7)** ships only the interface — add real CRM/ecommerce
   adapters only when asked.
6. Optional: flip a number from simulator to Meta using the Settings credentials
   and a Meta test number to exercise the real loop.

Do **not** start phases 6, 8, or 11 without an explicit request.

---

## 9. Conventions and gotchas

- **Tenancy:** never accept an organization id from the browser. Identity comes
  from the bearer token; the backend resolves the org. Frontend sends no org id.
- **Secrets:** Meta tokens and integration secrets are encrypted at rest in the
  backend and never returned to the browser. No secret is ever `NEXT_PUBLIC_*`.
- **Providers are seams:** Meta lives in `services/whatsapp/*`; the AI provider in
  `services/ai/provider.js`; CRM/ecommerce/MCP behind `services/integrations`.
  Keep new provider code inside these.
- **One responder per conversation:** `ai` / `human` / `paused`. Human takeover
  must stop the AI immediately.
- **Webhooks stay fast and idempotent:** persist → queue → return; repeated Meta
  deliveries must not duplicate work (idempotency by external event/message id).
- **React 19 lint is strict.** Avoid `setState` synchronously in an effect body —
  derive instead, or set state inside a promise/event callback, or use
  `useSyncExternalStore`.
- **Fonts** are self-hosted woff2 (Barlow / Barlow Condensed, OFL); no font CDN.
- `.env` is gitignored; `server/.env.example` and root `.env.example` list every
  variable. `ENCRYPTION_KEY` and `AUTH_SECRET` must be set (generate with
  `openssl rand -hex 32`).
- `.impeccable/` holds the design docket, surface briefs and reference mocks
  (provenance for `DESIGN.md`); keep it. `.gemini/` is the impeccable CLI's
  project install and is gitignored.

---

## 10. Manual configuration still required (none blocking local dev)

- **`DATABASE_URL`** and **`ENCRYPTION_KEY`** — infrastructure-level env vars.
  The key encrypts stored credentials, so it must exist before anything is saved.
- **`AUTH_SECRET`** — recommended explicitly; falls back to `ENCRYPTION_KEY`.
- Meta credentials — paste access token, app secret and verify token in
  **Settings → API credentials** (or per number on the WhatsApp page). No Meta
  env vars are required.
- AI provider — choose `mock` or `openai` and paste the key/base URL/model in
  **Settings → API credentials**. Mock needs no key.
- `REDIS_URL` only if the queue driver is switched from in-process to Redis.
- Meta webhook subscription itself is still configured in the Meta dashboard;
  the app cannot subscribe for you.
