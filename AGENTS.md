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

**For any UI change** (new page, new section, or non-trivial layout change), include an **ASCII diagram** of the resulting UI in the plan or PR description so we can visualize it before or while implementing (e.g. breadcrumb, title, main content blocks, key controls, and table/list structure).

### Continuous UI improvement

After completing any change (feature, bugfix, refactor), re-read `docs/styleguide.md` and identify **exactly one** non-breaking UI improvement in the files you touched or nearby. Apply it in the same changeset. Examples: replacing a hardcoded color with the correct palette value, switching a `.slice()` truncation to CSS `-webkit-line-clamp`, adding a missing `aria-label`, extracting a repeated inline style into a CSS class, fixing a spacing token that doesn't match the scale, **or ensuring style consistency across views/pages** (e.g. reusing the same component or CSS class for the same kind of control so the timeline and source links view don't diverge). Keep each improvement small and safe — it must not alter layout or behavior in a way that could surprise the user.

## Key directories

- `app/` — Next.js pages (App Router)
- `components/compass/` — shared React components
- `convex/` — Convex schema, queries, mutations, actions
- `lib/` — shared utilities, types, scan pipeline
- `lib/scan/sources/` — source agent implementations
- `docs/` — documentation including the style guide

## Design documents (HLD, LLD, EARS)

**Any change to the product or implementation must be reflected in the design documents** in the same changeset (or immediately after). The docs are the single source of truth; keep them in sync with the code.

**Arrow of intent:** **HLD** → **LLD** → **EARS** (architecture → implementation map / contracts → testable requirements). **Settings and other UI chrome** also follow **[`docs/styleguide.md`](docs/styleguide.md)** (canonical layout/components); Settings has a **traceability table** under §6 *Layout patterns* linking EARS ↔ HLD §4.2 ↔ LLD ↔ styleguide — keep those in sync when `/settings` changes. Propagate changes downward so the chain stays aligned; [docs/EARS.md](docs/EARS.md) §8 links back to HLD, LLD, and the styleguide.

- **[docs/HLD.md](docs/HLD.md)** — High-Level Design: system context, major components, data flow, external integrations. Update when architecture or integration points change.
- **[docs/LLD.md](docs/LLD.md)** — Low-Level Design: modules, Convex functions, API contracts, key data structures. Update when adding/removing modules, endpoints, or Convex API surface.
- **[docs/EARS.md](docs/EARS.md)** — Requirements in EARS format (Ubiquitous, Event-driven, State-driven, Optional feature, Unwanted behavior). Update when adding, changing, or retiring requirements.
- **[docs/styleguide.md](docs/styleguide.md)** — Visual and IA patterns (including Settings sidebar tabs). Update when changing layout, tokens, or accessibility patterns for shared UI; required reading before UI work (see above).

### Task completion — design-doc audit (subagent)

**On completion of every task** (feature, bugfix, refactor, or material change to product behavior or APIs), **launch a subagent** whose job is to ensure **[`docs/HLD.md`](docs/HLD.md)**, **[`docs/LLD.md`](docs/LLD.md)**, and **[`docs/EARS.md`](docs/EARS.md)** stay accurate relative to the work just completed. In Cursor, use the **Task** tool (or equivalent) with a focused prompt, for example: compare touched files and behavior to those three documents; report drift; **edit HLD/LLD/EARS** where needed so architecture, contracts, and requirements match the codebase. Treat the task as **not done** until that pass finishes and any required doc updates are applied (or the subagent explicitly confirms no changes were necessary).

Update HLD/LLD/EARS **during** implementation when the required edits are obvious; the subagent pass is the backstop for drift. Do not merge or ship changes that leave the design documents out of date.

## Debugging and logs

When debugging **Convex `Server Error` or `[Request ID: …]`** messages, **inspect deployment logs first** — do not guess from generic client errors.

| Surface | Where |
|--------|--------|
| Next.js (`/api/*`, SSR) | Terminal running `npm run dev` |
| Convex (queries, mutations, scheduler) | `npm run convex:logs` or dashboard **Logs** |

**Commands:**

- `npm run convex:logs` — stream logs (dev deployment from repo link).
- `npm run convex:logs -- --history 100` — print the last ~100 lines (good right after reproducing).
- `npm run convex:logs -- --history 200 --jsonl \| rg <RequestId>` — filter JSONL by request id or function name.
- `npm run convex:logs:prod` — stream **production** (use with care).
- `npm run inspect-logs` — print this cheat sheet; `npm run inspect-logs:convex -- --history 80` forwards to `convex logs` (same as `node scripts/inspect-logs.mjs convex --history 80`).

**Dashboard:** [Convex dashboard](https://dashboard.convex.dev) → project → **Logs**.

**Agents:** After reproducing a failure, run `npm run convex:logs -- --history 150` (or `--jsonl` + ripgrep) and read the stack / validation error before changing code.

**Symptom:** UI or API shows a generic Convex **Server Error** while logs say **`Could not find public function`** / **`Did you forget to run npx convex dev`**. **Cause:** the cloud deployment does not have your latest `convex/` code. **Fix:** run **`npx convex dev`** in a separate terminal (or **`npx convex deploy`**) until functions finish uploading; keep it running during local dev whenever you change Convex code. **`npm run dev` alone does not push Convex functions.**

**Production deploy from CI:** Pushes to **`main`** run [`.github/workflows/convex-deploy.yml`](.github/workflows/convex-deploy.yml) (`npx convex deploy`). The repo needs the **`CONVEX_DEPLOY_KEY`** secret (`gh secret set CONVEX_DEPLOY_KEY`). See **README → Deploying Convex from GitHub Actions**.

## Conventions

- TypeScript strict mode. No `any` except for Convex metadata fields.
- React components are function components. No class components.
- Convex queries/mutations use validators from `convex/values`.
- All hooks must be called unconditionally (React Rules of Hooks). Never place `useQuery`/`useState` after conditional returns.
- CSS lives in `app/globals.css`. No CSS modules, no Tailwind, no CSS-in-JS.
- Inline styles are acceptable for one-off layout tweaks (gap, alignment). Colors and repeated patterns must use CSS classes.

### Markdown linting

**After editing any Markdown files** in this repository, run **`npm run lint:md`** and fix all reported issues before you consider the work complete. **Preferred workflow:** launch a **subagent** (e.g. Cursor **Task** tool) whose job is to run markdownlint on the Markdown you changed (or the whole repo via `npm run lint:md`), **apply edits in the repo** to fix every violation, and re-run until markdownlint exits with **zero** errors. Subagents must **not** stop at reporting problems — they should **make the edits** (bare URLs, table cell pipes, fenced code languages, heading punctuation, blank lines, etc.) until clean.

**Configuration:** [`.markdownlint.json`](.markdownlint.json). The `lint:md` script ignores `node_modules`, `.git`, and **`eval/edgar/outputs/**`** (generated).

### Event-driven side effects

Prefer event-driven design for side effects. When a meaningful domain event occurs (e.g. digest created, scan completed), trigger downstream work (email, notifications, Slack posts) via `ctx.scheduler.runAfter(0, internal.xxx)` from the mutation that produces the event. Do not inline the side effect in the same mutation or API handler. This keeps write paths fast, decouples producers from consumers, and makes the system easier to extend with new side effects later. Example: digest creation schedules `internal.email.sendDigestEmail` via the Convex scheduler.
