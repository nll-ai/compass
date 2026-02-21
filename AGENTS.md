# Compass — Agent Instructions

## Project overview

Compass is a competitive intelligence monitoring app for biotech teams, built with Next.js (App Router) + Convex (backend-as-a-service). It tracks watch targets (drugs, companies, targets) across data sources (PubMed, ClinicalTrials.gov, SEC EDGAR, Exa, Patents) and generates signal digests.

## Style and design guide

**Before making any UI change, read and follow [`docs/styleguide.md`](docs/styleguide.md).** It is the canonical reference for:

- Color palette (neutrals, semantic colors, source-type colors)
- Typography scale (font sizes, weights, line heights)
- Spacing system (rem-based tokens)
- Component patterns (cards, buttons, badges, forms, overlays, breadcrumbs, segmented controls, feedback controls)
- Layout patterns (page structure, section structure, action rows)
- States (loading, empty, error, disabled)
- Transitions and animation timing
- Accessibility requirements
- CSS architecture (when to use classes vs inline styles)

Every UI element must conform to the style guide. When the guide doesn't cover a case, extrapolate from the closest existing pattern and update the guide.

### Continuous UI improvement

After completing any change (feature, bugfix, refactor), re-read `docs/styleguide.md` and identify **exactly one** non-breaking UI improvement in the files you touched or nearby. Apply it in the same changeset. Examples: replacing a hardcoded color with the correct palette value, switching a `.slice()` truncation to CSS `-webkit-line-clamp`, adding a missing `aria-label`, extracting a repeated inline style into a CSS class, fixing a spacing token that doesn't match the scale, **or ensuring style consistency across views/pages** (e.g. reusing the same component or CSS class for the same kind of control so the timeline and source links view don't diverge). Keep each improvement small and safe — it must not alter layout or behavior in a way that could surprise the user.

## Key directories

- `app/` — Next.js pages (App Router)
- `components/compass/` — shared React components
- `convex/` — Convex schema, queries, mutations, actions
- `lib/` — shared utilities, types, scan pipeline
- `lib/scan/sources/` — source agent implementations
- `docs/` — documentation including the style guide

## Conventions

- TypeScript strict mode. No `any` except for Convex metadata fields.
- React components are function components. No class components.
- Convex queries/mutations use validators from `convex/values`.
- All hooks must be called unconditionally (React Rules of Hooks). Never place `useQuery`/`useState` after conditional returns.
- CSS lives in `app/globals.css`. No CSS modules, no Tailwind, no CSS-in-JS.
- Inline styles are acceptable for one-off layout tweaks (gap, alignment). Colors and repeated patterns must use CSS classes.
