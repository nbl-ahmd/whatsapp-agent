# DESIGN — Operator desk

The signed-in web app. One direction, locked: **Triage Strip**.

Source of truth for the contract: `.impeccable/surfaces/src-app-dashboard-layout-js.md`
(and its untargeted twin `.impeccable/surfaces/operator-desk.md`). Every token
below ships in `src/app/globals.css`; this file explains why.

---

## Direction contract

**THESIS.** The desk is a triage board, not an inbox table. Rows are ranked by who
needs a person, and each row's acuity tag is a promise with a colour. The neutral
"newest first" list, where every row looks equally urgent, is refused. Within one
acuity level the **longest-waiting promise ranks first** — the operator works the
oldest unkept promise before a fresher one at the same level.

**OWN-WORLD.** Clinical whiteboard paper under one dark ink bar. Four semantic
acuity inks, carried as solid tag blocks with a level number — never as
decorative pills. Barlow for interface text, Barlow Condensed for tags, numerals
and column rules. A 4px rule grid. Handover notes set on ruled lines.

**STORY.** Within one scan the operator knows which conversations have broken a
promise, who owns each, and what happens next; they take one over, reply, and the
strip re-ranks under their hands.

**FIRST VIEWPORT.** A dark bar carrying org, number health and today's counters;
beneath it the acuity legend as a fixed ruler; the ranked strip takes the left
two thirds — a 44px tag block, sender, last line, and a right-hand vitals column
of age, handover count and owner — while the selected conversation's handover
note and pinned composer occupy the right third.

**FORM.** Hospital triage boards and acuity tags. The ground the roll dealt as
IMPECCABLE'S PICK, second on the ranked list of seven. `seed:02b38808a78f9a59`.

**Memorable moment — the acuity step.** When a row crosses a threshold (a
human-mode conversation goes unanswered, a stalled AI reply, a refund intent),
its tag steps up and the row moves to its new rank in one 180ms step, while the
legend ruler above the strip never moves.

**Unresolved, taken as decided.** Paused conversations rank above AI-held ones,
because a person stopped it for a reason.

---

## Colour

Defined once as CSS custom properties in `:root` (`src/app/globals.css`), exposed
to Tailwind via `@theme inline` (`--color-*`).

### Ground and ink

| Token | Value | Use |
| --- | --- | --- |
| `--paper` | `#FBFAF7` | clinical whiteboard ground, all pages |
| `--paper-2` | `#F4F2EA` | hover rows, table headers, quiet fills |
| `--paper-3` | `#E9E6DA` | pressed/active fills, loading track |
| `--ink` | `#14181C` | primary text and the accent (buttons, rules, focus bar) |
| `--ink-2` | `#3C434A` | secondary text |
| `--ink-3` | `#656C73` | muted text, captions, the closed tag |
| `--rule` | `#DCD8CB` | hairline grid |
| `--rule-strong` | `#B8B3A2` | input borders, dashed empty blocks |

### The dark bar

| Token | Value | Use |
| --- | --- | --- |
| `--bar` | `#14181C` | the one dark surface, top bar and mobile sheet |
| `--bar-rule` | `#2B3238` | dividers inside the bar |
| `--bar-ink` | `#F2EFE6` | bar text |
| `--bar-dim` | `#98A1A8` | inactive nav, health label |

### Acuity inks

| Level | Code | Token | Value | Kind | Promise |
| --- | --- | --- | --- | --- | --- |
| 1 | P1 | `--critical` | `#C2311E` | `critical` | Someone is waiting and nobody has answered. |
| 2 | P2 | `--watch` | `#9A5B00` | `watch` | A person owns it, or the AI is still answering. |
| 3 | P3 | `--holding` | `#1D6B4E` | `holding` | The AI has it and the customer is answered. |
| 4 | P4 | `--ink-3` (`#656C73`) | — | `closed` | Nothing is owed. |

Tints `--critical-tint`, `--watch-tint`, `--holding-tint`, `--info-tint` are used
only for banner backgrounds, never for tags.

**Contrast floor.** `--watch` was darkened from `#C07A0C` (white text, 3.48:1) to
`#9A5B00` (white text, **5.43:1**; on paper 5.20:1) so every solid tag clears AA
for its white label. The hue still reads as amber/ochre, and no other ink moved.
`--critical` 5.5:1, `--holding` 6.4:1 and `--info` 9.3:1 were already clear.

**Refinement against the contract.** The contract named four acuity inks
(critical, watch, holding, info). In the build, level 4 (closed) leaves the
promise palette and is set in neutral `--ink-3`, because a closed row makes no
promise and must not compete for attention. `--info` `#1F4E8C` is kept as the
focus colour (`:focus-visible` outline) rather than a fourth tag ink. This is the
one deliberate deviation; it is a refinement, not a drift.

**Colour is never the only encoding.** Every tag carries its level number and
code (`P1`…`P4`) and a text label; every row's `AcuityBlock` shows the number and
a stamp (`NEEDS`, `WATCH`, `AI`, `CLOSED`). A colour-blind operator reads the
board fully.

---

## Typography

Two faces, self-hosted from `src/app/fonts/` through `next/font/local` (no CDN),
mapped to `--font-barlow` and `--font-barlow-condensed`.

- **Barlow** — interface text, 400/500/600/700. Body is 14px/20px with
  `font-variant-numeric: tabular-nums`.
- **Barlow Condensed** — the tag language: 500/600/700, used for tags, numerals,
  column rules, captions and the bar. `.caps` is 11px/16px, 600, 0.1em tracking,
  uppercase. `.num` is 600 with tabular numerals.

Type utility classes live in `globals.css`: `.cond`, `.caps`, `.caps-ink`, `.num`,
`.muted`, `.mono`.

**No kicker above a heading.** The `h1` carries its own weight; the old eyebrow
line was removed from `PageHead` and every page. Context that matters (the date on
the dashboard) lives in the sentence under the heading, not in a label above it.

---

## The 4px rule grid

`--step: 4px`. Spacing, row heights, the tag block (`44px`), the shell bar
(`--shell-bar: 56px`), the accent inset (`inset 3px 0 0 var(--ink)`) and the
composer all sit on it. Rules are hairlines (`--rule`) except the two structural
rules that are `--ink`: the top of `.ruler` and the bottom of `.table th` / the
top of `.stat-grid`.

Handover notes are set on ruled lines: `.note` draws a repeating 24px baseline
rule behind a `<dl class="note-row">`.

---

## Component inventory

All visual definitions live in `src/app/globals.css`; the React furniture lives in
`src/components/ui.js` so the world stays in one stylesheet.

| Piece | Class | Notes |
| --- | --- | --- |
| Shell bar | `.bar` | dark; brand, sections, number health, operator, sign out |
| Mobile sheet | `.sheet` | dark; opens under the bar, closes on select and Escape |
| Acuity ruler | `.ruler` `.ruler-seg` | sticky under the bar; a fixed legend that never moves; segments filter the strip |
| Strip row | `.list-row` | grid `44px 1fr auto`; accent inset when selected |
| Acuity block | `.acuity-block` | the 44px solid tag with level number + stamp |
| Tag | `.tag` / `.tag-quiet` | solid (promise) or quiet outline (context) |
| Panel | `.panel` `.panel-head` | bordered section with a condensed caps head |
| Table | `.table` | dense record tables; condensed caps head, hairline rows |
| Handover note | `.note` `.note-row` | ruled lines |
| Stat strip | `.stat-grid` `.stat` | counted facts, condensed numerals |
| Banner | `.banner` | tone via `data-tone` (`bad`/`warn`/`ok`); a solid ink square carries the tone, never a coloured side border |
| Empty | `.empty` | dashed block, plain language |
| Composer | `.composer` | pinned reply box in the detail pane |

The inbox layout (`.inbox`, `.strip`, `.detail`) is a two-pane grid; below 1040px
the detail becomes a full-screen overlay with a back control.

---

## Motion

- The acuity step: `transform 180ms cubic-bezier(.2,.7,.3,1)`, measured with
  `getBoundingClientRect` before and after a re-rank (`inbox/page.js`), so a row
  that changed rank slides rather than jumps.
- Micro-transitions on colour/background are 120ms.
- `prefers-reduced-motion: reduce` collapses all transitions/animations to 0.01ms.

---

## Accessibility

Baseline for an operator tool, and met in the code:

- Full keyboard reachability; `:focus-visible` uses a 2px `--info` outline with
  2px offset on every interactive element.
- AA contrast in the light theme: ink on paper, white on each acuity ink, bar ink
  on bar; placeholders use `--ink-3` (5.1:1 on paper, 4.75:1 on the tinted
  `--paper-2`), not a washed grey.
- **Functional text floor: 11px.** Nav, tags, table heads, field labels, notes,
  message metadata and stat labels are all ≥11px; only decorative marks may go
  smaller. (The detector pass caught 10px captions and 8px stamps in the first
  build and they were raised.)
- No colour-only status: see the acuity inks section.
- Reduced-motion support.
- Browser surfaces carry the palette: `::selection`, `caret-color: --ink`, and
  thin scrollbars tinted from `--rule-strong` / `--bar-rule` on the panes and the
  mobile sheet.
- 390px wide without horizontal scrolling; the strip and detail reflow.
- The shell is a landmark structure: skip link to `#desk`, `<header>`, `<nav>`,
  `<main>`; the sheet is a labelled `<nav>` toggled with `aria-expanded`.

---

## Provenance

- **Shipping rasters: none.** The product ships no photographs or illustrations.
  The only binaries are two self-hosted webfont families.
- **Fonts:** Barlow and Barlow Condensed, both by Jeremy Tribby, SIL Open Font
  License 1.1, self-hosted as `.woff2` in `src/app/fonts/`. No CDN and no
  `NEXT_PUBLIC_*` font origin.
- **Icons:** drawn inline as 14–15px stroke SVGs in the components (sign out,
  menu); no icon font, no icon package.
- **`public/*.svg`** are the untouched Create-Next-App defaults and are not
  referenced by any product screen.
- **Reference mocks** (not shipped, kept for provenance of the decision):
  `.impeccable/mocks/decision/model-pick.html` (the chosen world) and the four
  challengers alongside it.

---

## Finish and verdict

The brief's FINISH line: *unreviewed and undocumented is unfinished; this build
ends with the finish review, the verdict, DESIGN.md, and every shipping raster
carrying its provenance.*

Done here: this DESIGN.md, and the provenance record above (no rasters to tag).

**Verdict: unchanged from the contract, with one recorded refinement.** The
direction ships as specified — triage board, ranked strip, acuity tags carrying
the promise, one dark bar over clinical paper, the fixed ruler, the 180ms acuity
step — with closed rows set in neutral ink rather than a fourth promise colour.
The build is verified green (`lint`, `next build`, `npm test`); the *visual*
finish review against the mock is the operator's to give on the running app.
