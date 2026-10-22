# WhatsApp Automation SaaS

Multi-tenant WhatsApp automation platform built on the Meta WhatsApp Cloud API.
See [AGENTS.md](./AGENTS.md) for the domain architecture and phased plan.

Current status: **Phases 1–5 complete** — multi-tenant auth, WhatsApp Cloud API
send/receive with inbound media, contacts/conversations/inbox, the automation
engine, and a provider-neutral AI agent with tools. The app is split into a
**Next.js frontend** and a **standalone Node/Express backend**. Phase 10
(production readiness) is in progress: CI, readiness probe and a
[deployment runbook](./docs/DEPLOYMENT.md) are in place.

## Architecture

```text
                         Internet
                            │
             ┌──────────────┴──────────────┐
             ▼                             ▼
   app.yourdomain.com             api.yourdomain.com
         Vercel                         Render
      (Next.js UI)                 (Express backend)
             │                             │
             │  HTTPS API (NEXT_PUBLIC_API_URL)
             └────────────────────────────►│
                                           ├── REST API
                                           ├── WhatsApp webhooks
                                           ├── WhatsApp Graph API
                                           └── PostgreSQL (Prisma)
```

- The **frontend never talks to the database or Meta**. It only calls the backend
  over HTTPS via `src/lib/api.js`.
- The **backend owns all business logic, DB access, Meta API calls and webhooks**.
- Meta webhooks point at the **backend**, never at Vercel.

## Repository structure

```text
src/                       Next.js frontend (Vercel)
  app/                       dashboard pages (no API routes)
  components/                AppShell, auth gate/provider, shared UI primitives
  config/navigation.js       primary navigation
  lib/api.js                 centralized backend API client (+ authenticated media blobs)
server/                    Express backend (Render)
  src/
    server.js                entrypoint (binds PORT)
    app.js                   Express app factory
    config/env.js            backend environment config
    db/prisma.js             Prisma client (PostgreSQL)
    lib/                     framework-agnostic utilities (crypto, errors, logger, tenant, ...)
    middleware/              cors, error handler, not-found
    routes/                  HTTP routes
    controllers/             HTTP request/response mapping
    services/                business logic (whatsapp, webhooks, contacts, ...)
    utils/http.js            response helpers
server/prisma/             schema, migrations, seed (backend-owned)
server/tests/               node:test suite (services + backend HTTP)
```

Request flow: `route → controller → service → database / Meta API`.

## Local development

```bash
cp .env.example .env                 # NEXT_PUBLIC_API_URL
cp server/.env.example server/.env   # (or add backend vars to the root .env)
npm install                          # install frontend dependencies
npm --prefix server install         # install backend dependencies and generate Prisma
docker compose up -d                 # PostgreSQL + Redis
npm run db:migrate
npm run db:seed
```

Run the two services in separate terminals:

```bash
# Terminal 1 - backend API
npm run dev:api        # http://localhost:4000

# Terminal 2 - frontend
npm run dev            # http://localhost:3000
```

Local URLs: frontend `http://localhost:3000`, backend `http://localhost:4000`.
The backend loads the repo-root `.env` (and `server/.env` if present).

For local webhook testing, expose the **backend** (port 4000) over HTTPS:

```bash
cloudflared tunnel --url http://localhost:4000    # or: ngrok http 4000
```

## Environment variables

Frontend (`.env`, Vercel) - browser-safe only:

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

Backend (`server/.env` or root `.env`, Render):

```env
PORT=4000
HOST=0.0.0.0
FRONTEND_URL=https://app.yourdomain.com
DATABASE_URL=postgresql://...
ENCRYPTION_KEY=<openssl rand -hex 32>
REDIS_URL=redis://...
WHATSAPP_GRAPH_API_VERSION=v21.0
WHATSAPP_VERIFY_TOKEN=...
WHATSAPP_APP_SECRET=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_BUSINESS_ACCOUNT_ID=...
WHATSAPP_TEST_API_KEY=...            # required in production for the send endpoint
AI_API_KEY=...
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

No secret is ever prefixed with `NEXT_PUBLIC_`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Frontend dev server (`:3000`) |
| `npm run dev:api` | Backend dev server with watch (`:4000`) |
| `npm run build` | Next.js production build (Vercel) |
| `npm start` | Backend production server (Render) |
| `npm run start:web` | Next.js production server |
| `npm run lint` | ESLint (frontend) |
| `npm test` | Test suite (node:test) |
| `npm run db:generate` / `db:validate` / `db:push` / `db:migrate` / `db:deploy` / `db:seed` / `db:studio` | Prisma tasks |

## Backend API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Liveness probe - returns `{ "status": "ok" }` |
| `GET` | `/health/ready` | Readiness probe - checks PostgreSQL, returns `503` when unreachable |
| `GET` | `/api/webhooks/whatsapp` | Meta verification handshake |
| `POST` | `/api/webhooks/whatsapp` | Meta inbound events (idempotent) |
| `POST` | `/api/whatsapp/messages` | Send text/image/document/template/interactive (session or `WHATSAPP_TEST_API_KEY`) |
| `GET` | `/api/whatsapp/templates?phoneNumberId=…` | Approved templates for the number's WABA |
| `GET` | `/api/whatsapp/media/:messageId` | Stream inbound media using the tenant's Meta token |

Send a test message:

```bash
curl -X POST http://localhost:4000/api/whatsapp/messages \
  -H 'content-type: application/json' \
  -H 'x-test-api-key: <WHATSAPP_TEST_API_KEY, only if set>' \
  -d '{"organizationId":"org_acme","phoneNumberId":"<phone number id>","to":"<recipient>","text":"Hello"}'
```

## Deployment

Full runbook: **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** — environment
variables, migrations, backups/restore, rollback, monitoring and the go-live
checklist.

**Frontend - Vercel** (root directory: repo root)

- Build: `npm run build`, Output: Next.js default
- Env: `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`
- The build does not require the backend or database.

**Backend - Render** (Web Service, root directory: `server`)

- Build: `npm ci --include=dev` (the Prisma CLI is a devDependency)
- Start: `npm start` (runs `node src/server.js`)
- Pre-deploy: `npm run db:deploy`
- Env: all backend variables above; set `FRONTEND_URL=https://app.yourdomain.com`
- Health check path: `/health/ready`

**Database - PostgreSQL** (Render/Neon/RDS). Only the backend connects to it.
Apply migrations with `npm run db:deploy` (from `server/` or the repo root).
Never run `db:seed` in production: it creates demo logins with a known password.

CI runs on every push to `main` and every pull request
(`.github/workflows/ci.yml`): frontend lint + build, and backend tests against a
PostgreSQL 16 service.

## Meta webhook configuration

In the Meta app → WhatsApp → Configuration:

- Callback URL: `https://api.yourdomain.com/api/webhooks/whatsapp`
- Verify token: the value of `WHATSAPP_VERIFY_TOKEN`
- Webhook field: `messages`

Submit the URL from the backend (only the backend responds to the handshake).

## Database

Prisma schema `server/prisma/schema.prisma`, migrations
`server/prisma/migrations`, seed `server/prisma/seed.mjs`. Models: `Organization`,
`User`, `WhatsAppAccount`,
`WhatsAppPhoneNumber`, `Contact`, `Conversation`, `Message`, `Automation`,
`AutomationRun`, `AIAgent`, `Tool`, `Integration`, `WebhookEvent`, `AuditLog`.

Every tenant-owned row carries `organizationId`; use the helpers in
`server/src/lib/tenant.js` so queries stay tenant-scoped. Credentials are
encrypted at rest with `server/src/lib/crypto.js` (`ENCRYPTION_KEY`).

## Security notes

- Browser origins allowed by CORS come from `FRONTEND_URL`; no wildcard.
- Meta/DB/AI secrets live only in the backend; BYOK credentials are AES-GCM
  encrypted at rest and returned to the browser only as "configured" flags.
- `WHATSAPP_APP_SECRET` enables webhook HMAC verification; when unset the
  backend logs a warning and skips it (always set it in production).
- Tenant identity comes from the bearer session token, never from a browser-sent
  organization id. `POST /api/whatsapp/messages` also accepts a server-to-server
  caller holding `WHATSAPP_TEST_API_KEY`; the shared key path is disabled in
  production when unset.
- Login/register, webhook deliveries and outbound sends are rate limited per
  process (see `server/src/config/env.js`). Tune the `*_RATE_LIMIT_*` variables
  if real traffic needs different limits.
- Every response carries `x-request-id` (or preserves a safe caller-supplied
  one), and error bodies include it. Security headers are set for all API
  responses, including HSTS in production.
- Logs are JSON and redact token/secret/password/api-key fields. Failed requests
  log at warn/error with the request id; successful requests log at debug.
