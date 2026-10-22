# Production deployment

Two services, one database:

```text
Vercel (Next.js UI)  ──HTTPS──▶  Render (Express API)  ──▶  PostgreSQL
                                        │
                                        ├──▶ Meta WhatsApp Cloud API
                                        └──▶ AI provider
```

The frontend never talks to PostgreSQL or Meta. All secrets live on Render.

---

## 1. Database

Create a PostgreSQL instance (Render Postgres, Neon, Supabase, RDS). You need
two connection strings:

| Use | String |
| --- | --- |
| Render web service | **Internal** URL (same region, lower latency) |
| Migrations / `pg_dump` from your machine | **External** URL |

Requirements:

- PostgreSQL 14+.
- SSL enabled if the provider requires it (their URL already includes the flag).
- Keep automated backups on, or schedule the `pg_dump` job below.

---

## 2. Backend on Render

Create a **Web Service** from this repository.

| Setting | Value |
| --- | --- |
| Root directory | `server` |
| Runtime | Node |
| Build command | `npm ci --include=dev` (the Prisma CLI is a devDependency and is needed by `postinstall` and migrations) |
| Start command | `npm start` |
| Health check path | `/health/ready` |
| Pre-deploy command | `npm run db:deploy` |

`/health` is a cheap liveness probe; `/health/ready` additionally runs
`SELECT 1` against PostgreSQL and returns `503` when the database is
unreachable. Use `/health/ready` for the platform health check.

### Required environment variables

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Internal PostgreSQL URL |
| `ENCRYPTION_KEY` | `openssl rand -hex 32`. Encrypts stored credentials. **Losing or rotating this makes saved credentials unreadable.** |
| `AUTH_SECRET` | `openssl rand -hex 32`. Signs session tokens. Falls back to `ENCRYPTION_KEY`; set it explicitly. |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | Vercel origin, e.g. `https://app.example.com`. Comma-separate multiple origins. No wildcard. |

`PORT` is injected by Render. Do not set it. `HOST` defaults to `0.0.0.0`.

### WhatsApp / AI

These can be set as environment variables, or per organization in
**Settings → API credentials** (encrypted in PostgreSQL). Environment values
are the fallback.

```env
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_GRAPH_API_VERSION=v21.0

AI_PROVIDER=openai
AI_API_KEY=
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

Optional:

```env
LOG_LEVEL=info
AUTH_TOKEN_TTL_HOURS=168
REDIS_URL=          # only if the queue driver is switched from in-process
WHATSAPP_TEST_API_KEY=   # only for unauthenticated server-to-server sends

# Process-local rate limits (defaults shown)
AUTH_RATE_LIMIT_MAX=20
AUTH_RATE_LIMIT_WINDOW_MS=900000
WEBHOOK_RATE_LIMIT_MAX=600
WEBHOOK_RATE_LIMIT_WINDOW_MS=60000
MESSAGE_RATE_LIMIT_MAX=60
MESSAGE_RATE_LIMIT_WINDOW_MS=60000
```

Rate limits are per API instance. If Render is scaled to multiple instances, the
effective limits multiply; move the counter to Redis before relying on strict
global quotas.

With `NODE_ENV=production` and no `WHATSAPP_TEST_API_KEY`, the shared-key path on
`POST /api/whatsapp/messages` is disabled — signed-in operators still work.

**Do not run `npm run db:seed` in production.** It creates demo organizations
with the known password `password123`. Seed is for local development only.

---

## 3. Frontend on Vercel

| Setting | Value |
| --- | --- |
| Root directory | repository root |
| Framework | Next.js |
| Build command | `npm run build` |
| Install command | `npm ci` |

Environment variables:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://<render-service>.onrender.com` (no trailing slash) |

`NEXT_PUBLIC_*` is inlined into the browser bundle at build time. Set it before
the first deploy and redeploy after changing it. Never put database URLs, Meta
tokens, AI keys or `ENCRYPTION_KEY` on Vercel.

---

## 4. Migrations

Migrations are forward-only. Run them **before** new code starts serving
traffic — the Render pre-deploy command does this automatically:

```bash
npm run db:deploy
```

From your machine against the external database URL:

```bash
cd server
DATABASE_URL='postgresql://...' npm run db:deploy
```

Rules:

- Never edit an applied migration; add a new one.
- Take a backup before a destructive migration.
- `db:push` is for disposable local databases only.

---

## 5. Meta webhook

In the Meta app → WhatsApp → Configuration:

| Field | Value |
| --- | --- |
| Callback URL | `https://<render-service>/api/webhooks/whatsapp` |
| Verify token | value of `WHATSAPP_VERIFY_TOKEN` (or the org setting) |
| Webhook field | `messages` |

The GET handshake and POST signature validation are handled by the backend.
If verification fails, confirm the token matches and that `FRONTEND_URL`/CORS is
not blocking anything (the webhook itself is public and not CORS-gated).

---

## 6. Backups and restore

Take a logical backup with `pg_dump` (custom format, no owner/ACL so it restores
into any role):

```bash
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" > whatsapp-$(date +%F).dump
```

Restore into an empty database:

```bash
pg_restore --clean --if-exists --no-owner --no-acl \
  --dbname "$DATABASE_URL" whatsapp-2026-10-22.dump
```

Operational rules:

- Store dumps encrypted and outside the database provider.
- Keep at least 7 daily + 4 weekly copies.
- **Escrow `ENCRYPTION_KEY` separately.** A database restore without the
  matching key leaves every stored Meta/AI credential unreadable.
- Do a restore drill into a scratch database before you need it in an incident.
- Test after restoring: `GET /health/ready`, then sign in and open the inbox.

---

## 7. Rollback

1. Roll back the Render service to the previous deploy.
2. If the bad release already applied a migration, do **not** downgrade the
   database by editing history. Ship a forward fix migration, or restore the
   pre-release dump if data is corrupted.
3. Vercel rolls back instantly via **Deployments → Promote** on the previous
   build; no database state is involved.
4. Roll back the frontend and backend together when the API contract changed.

---

## 8. Monitoring and operations

- Render health check: `/health/ready` (503 = database unreachable).
- Render logs are JSON lines; secrets are redacted by `server/src/lib/logger.js`.
- Watch for repeated `Queue handler failed` and webhook `401`/`403` entries —
  the first means automation/AI work is failing, the second means the app secret
  is wrong.
- Meta webhook retries are safe: processing is idempotent by external event and
  message id.
- Media served through `/api/whatsapp/media/:messageId` expires on Meta's side;
  an expired id returns `404`, which is expected, not an outage.

---

## 9. CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:

- **Frontend:** `npm ci`, `npm run lint`, `npm run build`.
- **Backend:** PostgreSQL 16 service, `npm ci`, `npm run db:deploy`,
  `npm run db:seed`, `npm test`.

Run the same checks locally before pushing:

```bash
npm run lint && npm run build && npm test
```

---

## 10. Go-live checklist

- [ ] PostgreSQL created; backups enabled; external URL saved.
- [ ] `ENCRYPTION_KEY` and `AUTH_SECRET` generated and escrowed.
- [ ] Render service deploys, `/health/ready` returns `200`.
- [ ] Migrations applied via pre-deploy (`npm run db:deploy`).
- [ ] Vercel deploys with `NEXT_PUBLIC_API_URL`.
- [ ] `FRONTEND_URL` matches the Vercel origin; sign-in works from the browser.
- [ ] Meta webhook verifies and a test message reaches the inbox.
- [ ] An outbound reply arrives on WhatsApp.
- [ ] AI provider configured (or deliberately left as `mock`).
- [ ] `WHATSAPP_APP_SECRET` set, so webhook HMAC validation is on.
- [ ] No secret is present in Vercel environment variables.
- [ ] Restore drill completed once.
