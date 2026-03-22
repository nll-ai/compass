# Compass UI Style Guide

This is the canonical reference for all visual and interaction design in Compass. Every UI change — new pages, components, or modifications to existing ones — MUST follow this guide. When in doubt, refer back here.

---

## 1. Design Philosophy

Compass is a professional competitive-intelligence tool for biotech teams. The UI should feel **calm, information-dense, and trustworthy** — like a Bloomberg terminal crossed with a modern SaaS dashboard.

**Principles:**

- **Clarity over decoration.** Every pixel should help the user understand their data. No ornamental gradients, shadows-for-the-sake-of-shadows, or extraneous borders.
- **Hierarchy through typography and spacing, not color.** Reserve color for semantic meaning (source types, significance levels, status).
- **Density without clutter.** Show as much useful information as fits; use whitespace to separate logical groups, not to pad.
- **Quiet interactions.** Transitions should be subtle (0.15–0.35s ease). Hover states should be discoverable but not distracting.
- **Consistency is non-negotiable.** The same element must look and behave identically everywhere it appears.

---

## 2. Color Palette

### Neutrals (primary palette)

| Token | Hex | Usage |
|-------|-----|-------|
| `--ink` | `#111827` | Primary text, headings, primary buttons |
| `--text` | `#374151` | Body text, secondary button text |
| `--muted` | `#6b7280` | Secondary labels, helper text, metadata (`.muted` class) |
| `--subtle` | `#9ca3af` | Tertiary text, dates, breadcrumb separators |
| `--border` | `#e5e7eb` | Card borders, dividers, input borders |
| `--border-hover` | `#d1d5db` | Hovered card borders, breadcrumb separators |
| `--surface` | `#ffffff` | Cards, overlays, inputs |
| `--surface-secondary` | `#f3f4f6` | Focus bars, inset backgrounds, tag backgrounds |
| `--bg` | `#fafafa` | Page background |

### Semantic colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--link` | `#2563eb` | Text links, "Open original" actions |
| `--error` | `#b91c1c` | Error messages, destructive actions |
| `--success` | `#059669` | Success badges, confirmation |

### Source-type colors

Each data source has a paired background/text color for badges and visual markers:

| Source | Background | Text |
|--------|-----------|------|
| `clinicaltrials` | `#ccfbf1` | `#0f766e` |
| `edgar` | `#fef3c7` | `#92400e` |
| `pubmed` | `#e0e7ff` | `#3730a3` |
| `biorxiv` | `#e0e7ff` | `#4338ca` |
| `patents` | `#ede9fe` | `#5b21b6` |
| `exa` | `#dbeafe` | `#1e40af` |
| `rss` | `#f3e8ff` | `#6b21a8` |
| `openfda` | `#d1fae5` | `#065f46` |

**Rule:** Source badges MUST use `.source-badge` with `data-source` attribute. Never hardcode source colors inline.

---

## 3. Typography

**Font stack:** `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

### Scale

| Element | Size | Weight | Letter-spacing | Line-height | Color |
|---------|------|--------|----------------|-------------|-------|
| Page title (h1) | `1.75rem` | 700 | `-0.02em` | 1.2 | `--ink` |
| Section heading (h2) | `1.15rem` | 600 | normal | 1.3 | `--ink` |
| Card heading (h3) | `1rem` | 600 | normal | 1.35 | `--ink` |
| Body text | `0.95rem` | 400 | normal | 1.5 | `--text` |
| Secondary text | `0.9rem` | 400 | normal | 1.5 | `--muted` |
| Small / meta | `0.85rem` | 500 | normal | 1.4 | `--muted` |
| Badges | `0.75rem` | 600 | `0.02em` | 1 | per-badge |
| Timeline month label | `0.8rem` | 600 | `0.05em` | 1 | `--subtle` (uppercase) |

**Rules:**
- Headings always have `margin: 0`. Spacing is controlled by the parent layout (`.stack` gap).
- Never use `<b>` or `<strong>` for emphasis in running text — use `font-weight: 600` if needed.
- Truncation: use CSS `-webkit-line-clamp` for multi-line truncation (3 lines max for summaries). Never truncate with JS `.slice()` for display text — use CSS overflow instead.

---

## 4. Spacing

The spacing system is based on `rem` units anchored to `1rem = 16px`.

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | `0.25rem` | Badge padding (vertical), tight gaps |
| `sm` | `0.5rem` | Badge padding (horizontal), between inline elements |
| `md` | `0.75rem` | Card internal padding (compact), list item gaps |
| `base` | `1rem` | Card padding, `.stack` default gap, section spacing |
| `lg` | `1.25rem` | Page-level section gaps |
| `xl` | `1.5rem` | `.container` padding, overlay internal padding |
| `2xl` | `2rem` | Between major sections (e.g. timeline months) |

**Layout classes:**
- `.stack` — vertical flex, `gap: 1rem`. Use for stacking sections, form fields, card contents.
- `.container` — `max-width: 1080px; margin: 0 auto; padding: 1.5rem`. Wraps page content.

**Rules:**
- Never use `margin-top` or `margin-bottom` on children inside a `.stack` — the parent gap handles spacing.
- Use `style={{ gap: "0.75rem" }}` on `.stack` when tighter spacing is needed. Never override with margin.

---

## 5. Components

### 5.1 Cards

```css
.card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1rem;
}
```

**Variants:**
- **Default card:** `.card` — section containers, settings panels, list items.
- **Stacked card:** `.card.stack` — card with vertically spaced children.
- **Interactive card (hover):** Add `transition: box-shadow 0.2s ease, border-color 0.2s ease` and on hover: `box-shadow: 0 2px 8px rgba(0,0,0,0.06); border-color: #d1d5db`. Used for timeline cards and clickable list items.
- **Compact card:** Override padding to `0.75rem 1rem` for dense lists.

**Rules:**
- Cards MUST NOT be nested inside other cards (no card-in-card). If a list item inside a card section needs its own border, use a lighter `border: 1px solid #e5e7eb` without the `.card` class, or use the `.card` class only on the inner items with the outer section being a plain container.
- Card `border-radius` is always `12px` for full-width cards, `10px` for compact/inline cards.
- **Watch Targets — Recent scans:** Section is `.card.stack`. Month group headings use `.scan-history-month` / `.scan-history-month-label` (uppercase, `--subtle`, same scale as timeline month labels). Dense rows use `.scan-history-list` with dividers between items. Implemented in `app/globals.css`.

### 5.2 Buttons

**Primary button:**
```
background: #111827
color: white
font-weight: 600
font-size: 0.9rem
padding: 0.5rem 1rem
border-radius: 8px
border: none
cursor: pointer
```

**Secondary button (outline):**
```
background: transparent
color: #374151
font-weight: 600
font-size: 0.9rem
padding: 0.4rem 0.75rem
border-radius: 8px
border: 1px solid #374151
cursor: pointer
```

**Standard secondary (outline):** `.button-secondary` in `app/globals.css` — full §5.2 secondary spec for panel actions (e.g. Watch Targets → **Connections** → **Refresh graph**).

**Compact secondary (outline):** `.button-secondary-compact` in `app/globals.css` — same treatment with smaller type/padding for dense rows (e.g. **Dismiss** beside source progress on Watch Targets → Running scans).

**Ghost button (text-only):**
```
background: none
border: none
padding: 0
font-size: 0.8rem
font-weight: 500
color: #6b7280
cursor: pointer
transition: color 0.15s
```
On hover: `color: #111827`.

**Implemented variant:** `.button-ghost` in `app/globals.css` matches the ghost spec (e.g. **Dismiss** on Watch Targets → Running scans).

**Disabled state:** `opacity: 0.5; cursor: not-allowed`. For async work while the control is disabled, set `aria-busy="true"`; `.button-secondary` and `.button-secondary-compact` then use `cursor: wait` via `[aria-busy="true"]` only.

**Loading state:** Show a small spinner (`12–14px`, `border-radius: 50%; animation: scan-spin 0.7s linear infinite`) inline to the left of the label. On **primary** (filled) buttons use a light ring: `border: 2px solid rgba(255,255,255,0.3); border-top-color: white` (see `ScanButton`). On **outline** secondary buttons use `.button-inline-spinner-outline` in `app/globals.css` (neutral track + `#374151` top segment).

**Rules:**
- Buttons always have `type="button"` unless they are form submit buttons (`type="submit"`).
- Destructive buttons: `background: #b91c1c; color: white`. Only for delete/remove actions.
- Never use `<a>` styled as a button for in-page actions. `<a>` is for navigation; `<button>` is for actions.

### 5.3 Badges

**Source badge (`.source-badge`):**
```css
.source-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}
```
Colored via `data-source` attribute using the source-type color palette.

**Generic badge:** Same shape but with `.card` base styling and neutral colors. Used for category, significance, and target badges.

**Rules:**
- Badges are always `display: inline-flex` with pill shape (`border-radius: 9999px`).
- Badge text is always uppercase or title-case, never sentence-case.
- Never put more than 3 badges in a single row. If more are needed, wrap to a second line.

### 5.4 Forms

**Input fields:**
```
display: block
width: 100%
margin-top: 0.25rem
padding: 0.5rem
border: 1px solid #e5e7eb
border-radius: 8px
font-size: 0.95rem
```
Apply `.card` class for consistent border and background.

**Labels:**
```
font-size: 0.85rem
color: #6b7280
font-weight: 500
```
Use `<label>` wrapping `<span className="muted">Label</span>` + `<input>`.

**Textareas:** Same as inputs but with `min-height: 4rem; resize: vertical`.

**Select dropdowns:** Same as inputs. Use native `<select>` with `.card` class.

**Rules:**
- Form groups use `.stack` with `gap: 0.75rem`.
- Error messages below inputs: `color: #b91c1c; font-size: 0.85rem; margin-top: 0.25rem`.
- Never use placeholder text as a substitute for a label. Placeholders are for examples only.

### 5.5 Overlays / Modals

**Structure:** Use `createPortal` to mount at `document.body`. Two layers:
1. **Backdrop:** `position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 100`.
2. **Panel:** Centered within backdrop. `background: white; border-radius: 12px; max-width: 640px; width: 100%; max-height: 85vh; overflow: auto; box-shadow: 0 20px 40px rgba(0,0,0,0.15)`.

**Animations:**
- Enter: `transform: scale(1); opacity: 1` (from `scale(0.98); opacity: 0`).
- Exit: reverse. Transition: `0.2s ease`.
- Use `onTransitionEnd` to clean up exit state.

**Close button:** Top-right of the panel. `background: #f3f4f6; border: none; border-radius: 6px; padding: 0.35rem; font-size: 1.25rem; cursor: pointer`. Content: `×`.

**Rules:**
- Clicking the backdrop closes the overlay.
- Focus is trapped in the overlay when open (move focus to close button on mount).
- `aria-modal="true"` and `role="dialog"` are required.

### 5.6 Breadcrumbs

**Structure:**
```html
<nav class="timeline-breadcrumb">
  <a href="...">Parent</a>
  <span class="sep">/</span>
  <a href="...">Child</a>
  <span class="sep">/</span>
  <span style="color: #374151">Current</span>
</nav>
```

**Rules:**
- The current page is plain text (not a link), colored `--text`.
- Links are `--muted` and transition to `--ink` on hover.
- Separator is `--border-hover` (`#d1d5db`), non-selectable.

### 5.7 Segmented Controls / Focus Bars

```css
.focus-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  padding: 0.375rem;
  background: #f3f4f6;
  border-radius: 10px;
}
.focus-pill {
  padding: 0.45rem 0.85rem;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #6b7280;
  font-weight: 500;
  font-size: 0.875rem;
  transition: all 0.15s ease;
  cursor: pointer;
}
.focus-pill[data-active="true"] {
  background: white;
  color: #111827;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
```

Use for tab-like filters (e.g. timeline focus). Implement with `<Link>` elements and `data-active` attribute.

### 5.8 Feedback Controls (Thumbs up / down)

Use the **same** control everywhere for consistency: `.source-link-feedback`. It is a pill group (gray background `#f3f4f6`, border `#e5e7eb`, border-radius 8px) containing two emoji buttons (👍 👎). Buttons: transparent by default, hover `#e5e7eb`, selected state `aria-pressed="true"` → white background, bold text, subtle box-shadow. No left border or timeline-specific styling.

**Where it appears:** Source Links view (target detail page) and Timeline view. Same class, same look.

**Behavior variants:**
- **Record-only** (Source Links view): Clicking records feedback, item stays visible. Both thumbs show current state via `aria-pressed` and the pill selected style.
- **Record-and-hide** (Timeline view): Thumbs down triggers a fade-out animation (`opacity: 0; max-height: 0; margin-bottom: 0` over `0.35s ease`), then persists feedback and removes the item.

---

## 6. Layout Patterns

### Page structure

Every page follows this skeleton:
```
<div class="stack">
  <!-- breadcrumb (if not top-level) -->
  <!-- page header: h1 + optional subtitle -->
  <!-- content sections -->
</div>
```

### Section structure

Sections are either:
- `.card.stack` — bordered section with heading, description, and content.
- Plain `.stack` — unbounded section (e.g. a list of cards).

### Action rows

Horizontal groups of buttons/links:
```
display: flex
flex-wrap: wrap
gap: 0.5rem–0.75rem
align-items: center
```

### Responsive

- All layouts use `flex-wrap: wrap` so they degrade to stacking on narrow viewports.
- `.container` max-width is `1080px` — optimized for readability.
- Timeline padding-left (`2.25rem`) accommodates the track line and month markers.

### Settings page (sidebar tabs)

- **Layout:** `.settings-layout` — flex row with `gap: 1.5rem`: `.settings-sidebar` (`flex: 0 0 11rem`, `min-width: 10rem`) wraps the tab rail; `.settings-panels` (`flex: 1`, `min-width: 0`) holds both tab panels.
- **Page chrome:** `<main class="stack" aria-label="Settings">`, `<h1>Settings</h1>`, muted subtitle (*Team workspace, digest timing, and related preferences.*). Team invite acceptance from `?teamInvite=` runs inside `<Suspense>` (child component); success/error messaging is shown on the **Team** tab (app switches to Team when the invite flow completes or errors).
- **Tabs:** `nav.settings-sidebar` with `aria-label="Settings categories"`. `.settings-tablist` has `role="tablist"` and `aria-orientation="vertical"` (wide viewports). Tabs: **`Team`** / **`Digest schedule`** — `role="tab"`, stable ids `settings-tab-team` / `settings-tab-digest`, `aria-selected`, `aria-controls` → `settings-panel-team` / `settings-panel-digest`. Panels: `role="tabpanel"`, `aria-labelledby` matching tab id, `hidden` when inactive. Default selected tab: **Team** (`activeTab === "team"`).
- **Panels — content split:** **Team** — membership, rename (admins), members list, invite-by-email, pending invites (admin), leave team, no-team states (create team, pending invites for email, optional invite-token copy). **Digest schedule** — natural-language schedule + timezone, save/clear, `formatSchedule` preview; no team controls here.
- **Responsive:** `@media (max-width: 720px)` — `.settings-layout` column; sidebar full width; `.settings-tablist` row + `flex-wrap`; `.settings-tab` `width: auto`.
- **Classes:** `.settings-tab:focus-visible` uses a blue outline ring (see `app/globals.css`); do not duplicate tab rail / selected styles inline on Settings.

#### Settings UI — traceability (arrow of intent)

| Layer | Where | What |
|-------|--------|------|
| **EARS** | `docs/EARS.md` | R-NAV-6 (tabs + a11y), R-NAV-7 (invite URL → Team tab feedback), R-SCH-1 / R-SCH-7 (digest only in Digest tab), R-TEAM-8 (Team panel behaviors) |
| **HLD** | `docs/HLD.md` §4.2 | Settings UI summary + data flow (schedule API, team invite link) |
| **LLD** | `docs/LLD.md` §1 | `app/settings/page.tsx`, `app/globals.css` settings classes |
| **Style (this doc)** | §6 Settings | Visual layout, roles, responsive behavior — canonical for UI chrome |

When changing Settings layout or tab behavior, update **this section**, **EARS**, and the **HLD/LLD** rows above in the same changeset.

### Watch Targets page (sidebar tabs)

- **Layout:** Reuses **Settings** classes: `.settings-layout`, `.settings-sidebar`, `.settings-tablist`, `.settings-tab`, `.settings-panels` (see `app/globals.css`). Same flex row, sidebar width, responsive column + horizontal tab wrap at `max-width: 720px`, and tab focus ring as Settings.
- **Page chrome:** `<main class="stack" aria-label="Watch targets">`, `<h1>Watch Targets</h1>`, muted subtitle. Optional **no-team** card (link to Settings) stays **above** the tab layout so it stays full width.
- **Tabs:** `nav.settings-sidebar` with `aria-label="Watch targets sections"`. `.settings-tablist` has `role="tablist"` and `aria-orientation="vertical"` (wide viewports). Tabs: **`Targets`** / **`Recent scans`** / **`Connections`** — `role="tab"`, stable ids `targets-tab-main` / `targets-tab-history` / `targets-tab-connections`, `aria-selected`, `aria-controls` → `targets-panel-main` / `targets-panel-history` / `targets-panel-connections`. Panels: `role="tabpanel"`, `aria-labelledby` matching tab id, `hidden` when inactive. Default selected tab: **Targets** (`activeTab === "main"`). **Connections** uses `crossTargetGraph.listEdgesForViewer` (see **Panels** below for **Target pairs** / **Shared sources**); use `.connections-split` for the two-column layout (stacks to one column ≤720px per existing settings breakpoint).
- **Panels:** **Targets** — scan success/error (from manual scans), **+ Add Watch Target**, then **In your digest** and **Team-wide targets** (team mode) or **Watch targets** (solo), then **Running scans** when non-empty. Do not put `.stack` on the same element as `role="tabpanel"` and `[hidden]` without the `.stack[hidden]` override in `globals.css`. **Recent scans** — **only** `listScanHistory` (month groups, completed/failed rows, **View digest** when present, **Re-run** on failed rows with targets — `.link` + `.link-as-button` for the action); stale row error text hidden after Re-run starts (restored if the request fails); inline success/error for retry; empty states when there are no targets or no history yet. **Connections** — overview copy + **Refresh graph** (secondary button); **Target pairs** column (one row per watch-target pair, aggregated edge count + source badges) + **Shared sources** column (`rawItems.getByIds` merged for the pair, URLs deduplicated; per-URL links to each target by display name); empty states when fewer than two targets or no edges yet.
- **Data loading:** `scans.listScanHistory` runs only when the **Recent scans** tab is selected and the user has at least one watch target (avoids loading history on the default tab). `crossTargetGraph.listEdgesForViewer` runs only when the **Connections** tab is selected and the user has at least one watch target (R-SCAN-8); the Connections panel still renders when there are zero targets so the “add at least two targets” copy can show (R-SCAN-9).
- **Ownership (team mode):** Hub cards may show a muted **View only — owner can edit or delete** line when `viewerCanEdit` is false from `watchTargets.listAll`. Target detail (`/targets/[id]`) hides edit/delete for non-owners and shows a short status line; see R-TEAM-16.

#### Watch Targets UI — traceability (arrow of intent)

| Layer | Where | What |
|-------|--------|------|
| **EARS** | `docs/EARS.md` | R-SCAN-6 / R-SCAN-7 / R-SCAN-8 / R-SCAN-9 (Recent scans + Connections tabs + default tab; retry failed), R-SCAN-1 (running scans on hub), R-TEAM-16 (owner vs viewer; `viewerCanEdit`) |
| **HLD** | `docs/HLD.md` §4.2 | Watch Targets hub schematic + scan history |
| **LLD** | `docs/LLD.md` §1 | `app/targets/page.tsx`, shared settings tab classes in `app/globals.css` |
| **Style (this doc)** | §6 Watch Targets | Layout, roles, responsive — mirror Settings §6 |

When changing Watch Targets layout or tab behavior, update **this subsection**, **EARS** (R-SCAN-6 / R-SCAN-8 if needed), and **HLD/LLD** in the same changeset.

---

## 7. States

### Loading

- **Page loading:** Show the page header (h1) and a `<p class="muted">Loading…</p>` below it. No spinner at page level.
- **Button loading:** Inline spinner + "Scanning…" or "Running…" text with `cursor: wait`.
- **List loading:** `<p class="muted">Loading…</p>` inside the section card.

### Empty

- **List empty:** `<p class="muted">No [items] yet. [Action suggestion].</p>` inside the section card.
- **Timeline empty:** Use `.timeline-empty` — centered text with dashed border and a link to the parent page.

### Error

- Inline error text: `color: #b91c1c; font-size: 0.9rem`.
- Never use alert boxes or toast notifications for errors — show them inline near the triggering action.

### Disabled

- Buttons: `opacity: 0.5; cursor: not-allowed`.
- Inputs: `opacity: 0.7; pointer-events: none`.

---

## 8. Transitions and Animation

| Property | Duration | Easing | When |
|----------|----------|--------|------|
| `color` | `0.15s` | `ease` | Link/button hover |
| `opacity` | `0.15s` | `ease` | Feedback button hover |
| `box-shadow, border-color` | `0.2s` | `ease` | Card hover |
| `opacity, max-height, margin-bottom` | `0.35s` | `ease` | Timeline card dismiss |
| `transform, opacity` | `0.2s` | `ease` | Overlay enter/exit |
| `all` | `0.15s` | `ease` | Focus pill state change |

**Rules:**
- Never animate `width` or `height` directly — use `max-height` or `transform: scale`.
- No animations longer than `0.4s`. The app should feel snappy.
- Use `pointer-events: none` on exiting elements to prevent interaction during animation.
- Loading spinner: `animation: scan-spin 0.7s linear infinite`.

---

## 9. Accessibility

- All overlays: `role="dialog"`, `aria-modal="true"`, `aria-label`.
- Buttons with icons only: `aria-label` is required.
- Feedback buttons: `aria-pressed` reflects current state.
- Focus pills / tabs: `role="tablist"` on container, `role="tab"` and `aria-selected` on each pill.
- Breadcrumb container: `<nav>` element.
- When a block of helper text applies to a specific field below it, give the text an `id` and reference it from the input with `aria-describedby` (e.g. Settings team invite email field + helper copy).
- Images and icons: `aria-hidden="true"` for decorative elements.
- Color contrast: all text/background combinations must meet WCAG 2.1 AA (4.5:1 for normal text, 3:1 for large text).

---

## 10. CSS Architecture

### Classes defined in `globals.css`

| Class | Purpose |
|-------|---------|
| `.container` | Page content wrapper (max-width, centering, padding) |
| `.stack` | Vertical flex with `gap: 1rem` |
| `.card` | White bordered surface |
| `.muted` | Secondary text color |
| `.source-badge` | Source-type pill (colored via `data-source`) |
| `.timeline-*` | Timeline-specific components |
| `.focus-bar`, `.focus-pill` | Segmented control |
| `.settings-layout`, `.settings-sidebar`, `.settings-tablist`, `.settings-tab`, `.settings-panels` | Settings and Watch Targets hub: sidebar + vertical tabs + panel region |
| `.connections-split`, `.connections-row-button` | Watch Targets **Connections**: responsive two-column grid (≤720px single column); focus ring on edge row buttons |
| `.source-link-feedback` | Thumbs up/down pill group (Source Links + Timeline) |
| `.timeline-empty` | Empty state for timeline |

### Inline styles

Inline styles are acceptable for **one-off layout adjustments** (gap overrides, alignment, specific widths). They are NOT acceptable for:
- Colors (use CSS classes or variables)
- Font sizes that deviate from the type scale
- Repeated patterns (if you write the same inline style 3+ times, extract a CSS class)

### Adding new CSS

- Add new classes to `globals.css` grouped by feature section (comment-delimited).
- Prefix feature-specific classes with the feature name (e.g. `.timeline-*`, `.digest-*`).
- Never use `!important`.
- Never use ID selectors.

---

## 11. Applying This Guide When Coding

When building or modifying any UI element:

1. **Check this guide first** for the relevant component pattern.
2. **Use existing CSS classes** before writing inline styles.
3. **Match the color palette exactly** — never approximate hex values.
4. **Follow the type scale** — don't invent new font sizes.
5. **Test hover, focus, empty, loading, and error states** for every interactive element.
6. **Keep cards flat** — no nested cards, no drop shadows on static elements.
7. **Use semantic HTML** — `<nav>`, `<article>`, `<section>`, `<button>` vs `<a>`.

When the guide doesn't cover something, extrapolate from the closest existing pattern and update this document.
