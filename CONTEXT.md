# CONTEXT — resume notes

Handoff for a fresh session. Read this first, then `AGENTS.md` (rules + phases),
`PRODUCT.md` (product truth), and `DESIGN.md` (the locked visual direction). This
file is for *state*: what exists, what is verified, what is next. The history of
completed work is in `CHECKPOINTS.md`.

Last updated: 2026-10-22.

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
npm test                 # node --test, server/tests  (currently 62 pass)
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

## 3. Verified state (2026-10-22, production readiness started)

- `npm run lint` → clean.
- `npm run build` → succeeds; all 12 routes prerender.
- `npm test` → **76/76** pass (auth, analytics, automation, CORS, crypto, database
  integration, error reporter, integrations/adapters, messaging, pipeline integration,
  http incl. readiness, security/rate limits, tenant scoping, tools, settings, whatsapp
  normalize/verify/integration, media proxy).
- Manual HTTP E2E on throwaway orgs: text send → conversation → reply; template
  send; media proxy rejects a text message with a clear 404; template listing on a
  simulator number fails with a validation error (no WABA). Tenants cleaned up.
- `impeccable detect` → **0 findings** on `/login` at 1280×800 and 390×844, and on
  `src` (last run 2026-10-19; UI changes since are form-only).
- In-page audit of all nine authenticated routes (viewport 1000px, 2026-10-19): no
  functional text under 11px, no horizontal overflow, no console errors, **no AA
  contrast failures**. (The detector cannot scan authenticated URLs; this is the
  substitute.)

Working tree: the Phase 1–5 history is in `CHECKPOINTS.md`. The current work
(readiness probe, CI, deployment runbook) is the latest checkpoint.

---

## 4. Phases — where things stand

| Phase | Status |
| --- | --- |
| 0 Project init | done |
| 1 DB + multi-tenancy | done — org scoping via `server/src/lib/tenant.js`, auth middleware in `server/src/middleware/auth.js`, every query tenant-scoped |
| 2 WhatsApp Cloud API + webhook | done — verify/signature, persist raw event, idempotent processing, send/receive, simulator provider; outbound text/image/document/template/interactive; inbound media streams through an authenticated proxy |
| 3 Contacts, conversations, messages, inbox | done — services + controllers + the web app pages; inbound media proxy, live thread polling, newest-page history, image/document/template replies |
| 4 Automation engine | done — JSON workflows, conditions/actions, run history, queue behind `server/src/lib/queue.js` |
| 5 AI agent + internal tools | done — provider-neutral (`ai/provider.js`: openai-compatible or mock), tool registry with schemas/permissions (`tools/registry.js`), agent loop (`ai/agent.js`); BYOK config per organization |
| 6 WhatsApp Flows | not started (out of scope until asked) |
| 7 CRM/ecommerce adapters | done for MVP — adapter registry + HubSpot CRM and Shopify ecommerce providers, encrypted connection CRUD, connection test, and generic `crm_*` / `ecommerce_*` AI tools. MCP is phase 8 |
| 8 MCP | not started |
| 9 Logs/analytics/hardening | done for MVP — logs + audit + dashboard counts + 7-day message activity, rate limiting, security headers and request ids; log retention and analytics export deferred |
| 10 Testing/docs/prod prep | done for MVP — CI, `/health/ready`, deployment runbook, error webhook, load-test and backup scripts; schedule backups at the platform level |
| 11 Embedded Signup | not started (explicitly deferred) |

Frontend pages (`src/app/(dashboard)/`): Dashboard, Inbox, Contacts, Automations,
AI Agents, WhatsApp, Integrations, Logs and Settings are implemented.
Integrations can connect HubSpot/Shopify, test the connection and remove it.

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

- `src/lib/api.js` — bearer-token client, unwraps `{ data }`, 401 clears the session;
  `api.blob()` fetches authenticated inbound media.
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
`numbers`, `accounts`, `templates`, `messages`, `media/:messageId`, `webhook-status`),
and the public `webhooks/whatsapp`. Outside `/api`: `GET /health` (liveness) and
`GET /health/ready` (database readiness).

---

## 7. What recent sessions changed

### 2026-10-22 · Deployed 500 fix (unmigrated database)

1. **Diagnosis.** CORS was fixed, then auth returned 500 because
   `public.User` did not exist: migrations had never been applied on Render.
2. **Manual migrations.** `npm run db:deploy` applies migrations; nothing runs
   them at boot or deploy. `prisma` stays a production dependency so
   `postinstall` can generate the client on a plain `npm ci`.
3. **Readiness.** `/health/ready` checks the `User` table and reports
   `schema: "missing"` with a `503` instead of claiming the service is ready.
4. **Docs.** DEPLOYMENT has the recovery commands for existing deployments.

### 2026-10-22 · Deployed CORS fix

1. **Diagnosis.** A deployed register attempt reached Render but the browser
   blocked it: `FRONTEND_URL` did not match the Vercel `Origin` (unset,
   localhost, trailing slash, or a preview hostname).
2. **CORS.** Origins are normalized and constrained patterns
   (`https://*.vercel.app`) are supported; bare `*` is rejected. Blocked origins
   are logged once and preflights from them return `403`.
3. **Visibility.** Boot warns when production `FRONTEND_URL` is localhost; the
   frontend reports the API URL and the env checklist instead of "Failed to
   fetch". `docs/DEPLOYMENT.md` has the troubleshooting steps and a curl check.
4. **Tests.** `server/tests/cors.test.js`; suite is 76/76.

### 2026-10-22 · CRM/ecommerce adapters (phase 7)

Goal: replace the empty integration seam with real providers and AI tools.

1. **Adapter registry.** `services/integrations/registry.js` stores provider
   factories plus the fields their connection form needs; `adapters/index.js`
   registers HubSpot (CRM) and Shopify (ecommerce).
2. **Encrypted connections.** `services/integrations/index.js` creates, updates,
   deletes and tests connections. Secret fields are AES-GCM encrypted; the API
   returns only flags and non-secret config.
3. **AI tools.** `crm_find_customer`, `crm_create_lead`,
   `ecommerce_search_products`, `ecommerce_get_order` and
   `ecommerce_list_orders` resolve the organization's active provider at call
   time. No vendor name appears in the prompt.
4. **UI.** The Integrations page can connect a provider, test it, remove it and
   shows the catalog. API routes are admin-only for writes.
5. **Tests.** `server/tests/integrations.test.js` runs both adapters against a
   local mock provider, verifies credentials never appear in list responses,
   checks tool resolution and the "no active integration" error.

### 2026-10-22 · Production readiness leftovers (phase 10)

1. **Error reporting.** Optional `ERROR_WEBHOOK_URL` receives unhandled HTTP and
   queue failures as bounded, secret-free JSON (request id, route, short stack),
   throttled to one report per 5 s.
2. **Backups.** `npm run db:backup` writes a custom-format `pg_dump` into
   `server/backups/` and prunes dumps older than `RETENTION_DAYS` (default 7).
3. **Load test.** `npm run load:webhook` sends signed unique webhooks to a running
   API and prints throughput, p50/p95 and status counts. Use staging.
4. **Docs.** DEPLOYMENT covers the error webhook, cron backup example and load-test
   procedure. Suite is 72/72.

### 2026-10-22 · Analytics activity (phase 9, finished for MVP)

Goal: replace the dashboard's conversation-derived estimate with real counts.

1. **`getActivity()`.** Two aggregate SQL queries bucket inbound/outbound messages
   and new conversations per UTC day; days with no activity are filled in JS. The
   window defaults to 7 days and clamps to 1–30.
2. **Dashboard.** `GET /api/dashboard` returns `activity` alongside the existing
   counts. The chart now shows stacked inbound/outbound message volume with a
   legend instead of counting the last 100 conversations.
3. **Tests.** `server/tests/analytics.test.js` covers UTC buckets, empty days,
   tenant isolation, window clamping and the dashboard payload; suite is 70/70.

Deferred: arbitrary date ranges, CSV export, and a log-retention policy.

### 2026-10-22 · Security hardening (phase 9, started)

Goal: close the obvious production abuse and observability gaps without adding
dependencies.

1. **Rate limits.** `server/src/lib/rateLimit.js` is a fixed-window limiter; the
   shared instances in `middleware/rateLimits.js` protect login/register (per IP),
   webhook deliveries (per IP) and outbound sends (per organization). Limits are
   env-configurable and process-local.
2. **Security headers.** `middleware/requestContext.js` sets nosniff, frame deny,
   no-referrer, permissions policy, a document CSP (skipped for media) and HSTS
   in production.
3. **Request ids.** Every response gets `x-request-id`; a safe caller-supplied id
   is preserved. Error bodies include it, and failed requests log at warn/error.
4. **Tests.** `server/tests/security.test.js` covers headers, id handling, the 404
   envelope and limiter quotas/isolation; suite is 68/68.

Still open for phase 9: analytics beyond today's counts (trends/date ranges).

### 2026-10-22 · Production readiness (phase 10, started)

Goal: make the split deployment operable before adding more features.

1. **Readiness.** `GET /health/ready` checks PostgreSQL with `SELECT 1` and returns
   `503` when it cannot connect. `/health` stays a liveness probe. Neither leaks
   connection strings. Render should use `/health/ready`.
2. **CI.** `.github/workflows/ci.yml` lints and builds the frontend, and runs the
   backend suite against a PostgreSQL 16 service after `db:deploy` + `db:seed`.
3. **Runbook.** `docs/DEPLOYMENT.md` documents Vercel/Render settings, env vars,
   pre-deploy migrations, Meta webhook setup, backups/restore (including
   `ENCRYPTION_KEY` escrow), rollback and a go-live checklist.
4. **Test.** Readiness is covered in `server/tests/server.http.test.js`; suite is
   63/63.

### 2026-10-22 · Inbound media + chat + templates

Goal: finish the WhatsApp loop after the metadata-only media phase.

1. **Media proxy.** `GET /api/whatsapp/media/:messageId` resolves the inbound
   media id with the tenant's Meta token and streams the bytes. The browser fetches
   it with `api.blob()` (bearer token), so Meta tokens never reach the client.
   Expired media is a 404; unsafe content types are forced to a download.
2. **Chat.** Inbound image/sticker/video/audio/document render in the thread.
   The thread opens at the newest message and polls every 10s while visible.
   `GET /api/conversations/:id/messages` now returns the **newest** page
   oldest-first (it used to return the oldest page).
3. **Templates.** The WhatsApp page loads approved templates for the selected
   number's WABA; the inbox attachment panel can send name/language/components.
   `GET /api/whatsapp/templates` now accepts `phoneNumberId`.
4. **Previews.** Media messages produce a preview (caption, filename or `[type]`).
5. **Tests.** Added `server/tests/whatsapp.media.test.js`; suite is 62/62.

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

1. **Human visual pass on the running app.** Sign in as `owner@acme.test` and walk
   Dashboard → Inbox → Contacts → Automations → AI Agents → WhatsApp → Settings →
   Logs at 1440px, ~1040px and 390px. The media bubbles and template pickers
   have not been seen by a human yet.
2. **Real Meta test number.** Flip a number from simulator to Meta using the
   Settings credentials and exercise the full inbound → automation → AI → outbound
   loop. The deployment runbook lists the webhook setup.
3. **Integrations:** connect a real HubSpot/Shopify account (or a test store) from
   the Integrations page; the mock-provider tests prove the adapter seam, not the
   live vendor credentials.
4. **Phase 9 leftovers (optional):** arbitrary date ranges, CSV export, log
   retention policy.
5. **Phase 8 (MCP)** and phases 6/11 only on explicit request.

Do **not** start phases 6, 8, or 11 without an explicit request.

---

## 9. Conventions and gotchas

- **Tenancy:** never accept an organization id from the browser. Identity comes
  from the bearer token; the backend resolves the org. Frontend sends no org id.
- **CORS:** `FRONTEND_URL` is an exact-origin allowlist (comma separated); a
  trailing slash is ignored and `https://*.vercel.app` works for previews. Never
  use a bare `*`. Vercel preview URLs change per deployment — prefer adding the
  pattern, then narrow it when the custom domain is live.
- **Secrets:** Meta tokens and integration secrets are encrypted at rest in the
  backend and never returned to the browser. No secret is ever `NEXT_PUBLIC_*`.
- **Providers are seams:** Meta lives in `services/whatsapp/*`; the AI provider in
  `services/ai/provider.js`; CRM/ecommerce/MCP behind `services/integrations`.
  Keep new provider code inside these.
- **Integration credentials** are encrypted JSON on the `Integration` row. Resolve
  them with `resolveAdapter({ organizationId, category })`; never read the row
  from a controller or return credentials.
- **One responder per conversation:** `ai` / `human` / `paused`. Human takeover
  must stop the AI immediately.
- **Webhooks stay fast and idempotent:** persist → queue → return; repeated Meta
  deliveries must not duplicate work (idempotency by external event/message id).
- **Rate limits are per process.** They reset on deploy and do not coordinate
  across Render instances; use Redis if a strict global quota is ever required.
- **Request ids:** `req.id` is set by `middleware/requestContext.js`; include it
  in new error/log paths instead of inventing another correlation scheme.
- **Analytics uses UTC days.** `getActivity()` buckets by UTC midnight because the
  app has no per-organization timezone yet; label buckets with `timeZone: "UTC"`
  so the UI cannot shift them into the previous day.
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
