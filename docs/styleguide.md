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

**Disabled state:** `opacity: 0.5; cursor: not-allowed` (or `cursor: wait` when loading).

**Loading state:** Show a small spinner (`12–14px`, `border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: scan-spin 0.7s linear infinite`) inline to the left of the button label.

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

```css
.timeline-feedback {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  margin-left: 0.5rem;
  padding-left: 0.5rem;
  border-left: 1px solid #e5e7eb;
}
```

Buttons inside use emoji (👍 👎) at `font-size: 1rem; opacity: 0.6` (0.5 resting, 1.0 on hover/active).

**Behavior variants:**
- **Record-only** (Source Links view): Clicking records feedback, item stays visible. Both thumbs show current state via opacity.
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
| `.timeline-feedback` | Thumbs up/down control group |
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
