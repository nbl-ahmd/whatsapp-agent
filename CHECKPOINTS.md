# CHECKPOINTS — done-work log

Newest first. Each checkpoint records **what changed**, **how it was verified**, and
**what is left**. `CONTEXT.md` is the current state; this file is the history.

---

## 2026-10-20 · Commit pass

**Goal.** Get the large working tree into git as logical commits, leaving a clean
baseline for the next phase.

**Done.** Four commits on `main`, on top of `86946fd`:

- `230c65c` chore: ignore local tooling state and keep Next.js agent rules — adds
  `/.codex/` to `.gitignore` (machine-specific hook paths) and commits the
  `next dev`-managed agent-rules block.
- `c017d6f` feat(api): multi-tenant backend for phases 1-5 — 67 files: auth/org
  scoping, WhatsApp + idempotent webhook pipeline, contacts/conversations/messages,
  automation engine, AI agent + tool registry, provider-mode migration, seed, tests.
- `2c3a8ea` feat(web): Triage Strip dashboard, auth and operator pages — 61 files:
  tokens, AppShell, session provider, login, nine pages, shadcn primitives.
- `2817cbc` docs: product truth, design contract, state and checkpoints.

**Verified.**

- `npm test` → **51/51** pass.
- `npm run lint` → clean.
- `git status` → clean.

**Left.**

1. Human visual pass at 1440 / ~1040 / 390px (unchanged).
2. `README.md` is stale (says Phase 2; references deleted components; describes
   the old Vercel/Render split).
3. Phase 7 adapters, then phases 6/8/11 only on request.

---

## 2026-10-19 · Design pass — craft floor + docs (Triage Strip)

**Goal.** Get the desk running end to end, then improve the UI with the impeccable
detector and craft-floor rules, without re-skinning the locked world.

**Done.**

- **Made it run.** Frontend `npm run dev` on `http://localhost:3000` (Next 16 /
  Turbopack); API already listening on `http://localhost:4000` (`/health` → ok).
  Signed in as `owner@acme.test` and walked all nine authenticated routes.
- **Detector pass** (`impeccable detect`, login at 1280×800 and 390×844, plus `src`):
  - `undersized-ui-text` — 10px captions and an 8px acuity stamp → raised to the
    **11px functional floor** (nav, tags, table heads, field labels, message meta,
    stat labels, the acuity stamp; six inline `.caps` bumped too).
  - `low-contrast` — white on `--watch` was 3.48:1 → darkened `--watch` to
    `#9A5B00` (5.43:1); placeholder grey was 2.6:1 → `--ink-3`.
  - `side-tab` — the banner's 3px left rule → **a solid ink tone square** in a
    grid callout (same language as an acuity tag); the outbound bubble lost its
    2px left rule; the login error became a bordered tint.
- **Second contrast pass** (in-page audit across all nine routes, since the
  detector cannot authenticate): `--ink-3` was 4.29:1 on the tinted `--paper-2`
  (table heads, muted notes) → darkened to `#656C73` (**4.75:1** on paper-2,
  5.10:1 on paper). Hard-coded `#6c737a` in `.tag[data-level="4"]` and the
  `.acuity-block` now read `var(--ink-3)`.
- **Removed the kicker/eyebrow above headings** (a craft-floor ban) from
  `PageHead` and all seven pages plus the login panel; the dashboard date moved
  into the sentence under the `h1`.
- **Fixed a ranking contradiction.** The copy said "oldest first within a level"
  but `rankConversations` sorted newest-first; it now sorts **longest-waiting
  promise first**, matching the ruler note and the strip foot.
- **Themed browser surfaces** the palette: `::selection`, `caret-color: --ink`,
  and thin scrollbars tinted from `--rule-strong` / `--bar-rule`; a 1px press
  step on `.btn:active`.
- **Docs.** `DESIGN.md` updated (watch + ink-3 values with contrast notes, the
  11px floor, the no-kicker rule, the oldest-first ranking, browser surfaces);
  this file added.

**Verified.**

- `npm run lint` → clean.
- `npm run build` → passes; 12 routes prerender.
- `npm test` → **51/51** pass.
- `impeccable detect` → **0 findings** on login (1280 and 390) and on `src`.
- In-page audit on all nine routes: **0** functional-text-under-11px, **0**
  horizontal overflow, **0** console errors, **0** AA contrast failures
  (viewport 1000px).

**Notes / limits.**

- Screenshots were unavailable (no visible desktop window in this environment);
  inspection used the accessibility tree, computed styles, and detector URL
  scans. A human visual pass at 1440 / 1040 / 390 is still owed.
- The authenticated routes can't be URL-scanned by the detector (auth wall), so
  the rendered checks above are a hand-rolled equivalent.

**Left.**

1. Commit the large uncommitted tree (96 changed paths) in logical commits.
2. Human visual pass at 1440px, ~1040px and 390px.
3. Integrations page is still a `ModulePage` stub (phase 7) — build only when asked.

---

## 2026-10-19 · Frontend green + design contract

**Goal.** Get the frontend green after the visual build, then document the world.

**Done.**

- Cleared all 12 React-19 `set-state-in-effect` lint errors via derived state,
  event-handler `setState`, and `useSyncExternalStore` (`AuthProvider.js`,
  `useResource.js`, `AppShell.js`, and the contacts/inbox/automations/whatsapp/
  settings/ai-agents/logs pages).
- `useResource.js` rewritten: `loading`/`data`/`error` are derived from the path
  the held state was fetched for.
- Fixed the AI Agents "New agent" bug (a blank draft was overwritten by the
  auto-select effect); the form now follows an explicit draft.
- Wrote `DESIGN.md` (locked **Triage Strip** direction, tokens, typography,
  acuity language, motion, accessibility, provenance) and `CONTEXT.md`.

**Verified.** lint clean, `next build` passes, `npm test` 51/51.

---

## Earlier · Phases 0–5 (backend + app shell)

Built in one continuous pass, in the working tree (last commit before this work
was `86946fd`, the seed script):

- **Phase 1** — Prisma schema (13 core entities), multi-tenant scoping from the
  bearer token, auth middleware.
- **Phase 2** — WhatsApp Cloud API integration, webhook verify + signature,
  raw-event persistence, idempotent processing, simulator provider, single
  outbound messaging service.
- **Phase 3** — contacts / conversations / messages services + controllers and
  the inbox UI.
- **Phase 4** — event-driven automation engine (JSON workflows, conditions,
  actions, run history) behind a queue seam.
- **Phase 5** — provider-neutral AI agent (`mock` / openai-compatible) with an
  explicit tool registry (schemas + permissions).
- **Frontend** — Dashboard, Inbox, Contacts, Automations, AI Agents, WhatsApp,
  Logs, Settings in the Triage Strip world; Integrations is a stub.
