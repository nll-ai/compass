# Compass — Low-Level Design (LLD)

This document specifies implementation-level details: modules, Convex functions, API contracts, and key data structures. It is kept in sync with the codebase when changes are requested (see [AGENTS.md](../AGENTS.md)).

---

## 1. Module and file layout (relevant areas)

| Path | Purpose |
|------|---------|
| `app/targets/page.tsx` | Watch targets list: **Running scans** section (pending/running runs via `scans.listRunning`), link to `/targets/new` and `/targets/[id]`. |
| `app/targets/new/page.tsx` | Add watch target page; renders `NewTargetFormSection`. |
| `app/targets/new/NewTargetFormSection.tsx` | Wraps `AddTargetForm` with `onAdded={(id) => router.push(\`/targets/${id}\`)}`. |
| `app/targets/[id]/page.tsx` | Target detail: source selector, run scan, edit target, **scan schedule** (collapsible), insights links, source links, signal reports, delete. |
| `app/settings/page.tsx` | Settings: Slack integration and source config (no scan schedule). |
| `components/compass/AddTargetForm.tsx` | Lookup + form; calls `watchTargets.create`, then `onAdded?.(id)` with returned ID. |
| `lib/formatSchedule.ts` | `formatSchedule(schedule)` and `COMMON_TIMEZONES`; used by target detail page for per-target schedule. |
| `convex/watchTargets.ts` | `create` (returns `Id<"watchTargets">`), `get`, `update`, `remove`, `getByIdsInternal`. |
| `convex/scanSchedule.ts` | `getForTarget`, `listPerTargetSchedules`, `setForTarget`, `removeForTarget`, `checkAndTrigger` (cron). |
| `convex/digests.ts` | `createDigestRunWithItemsFromServer`, `createDigestRunWithItems`; both schedule `internal.email.sendDigestEmail` after insert. |
| `convex/digestRuns.ts` | `getById` (internal), `get`, `listSignalReportsForTarget`, etc. |
| `convex/users.ts` | `getUserById` (internal). |
| `convex/email.ts` | `sendDigestEmail` (internal action, `"use node"`). |
| `convex/scans.ts` | `listRunning`, `listRecent`, `get`, `getSourceStatuses` (queries); `getScanRun` (internal), `scheduleScan` (internal), `callScanApi` (internal action). |
| `app/api/schedule/parse/route.ts` | POST body `{ description, timezone }` → parsed schedule fields (daily/weekly, hour, minute, weekdaysOnly, etc.). |

---

## 2. Convex public API (relevant functions)

### 2.1 Watch targets

- **watchTargets.create** (mutation)  
  Args: name, displayName, type, therapeuticArea, aliases, indication?, company?, notes?, active.  
  Returns: `Id<"watchTargets">`.  
  Creates row with `userId` from `getOrCreateUserId`.

- **watchTargets.get** (query)  
  Args: `{ id: string }`.  
  Returns: watch target doc or null (auth: must own target).

### 2.2 Scans (run visibility and status)

- **scans.listRunning** (query)  
  Args: none.  
  Returns: scan runs for the current user's targets with status `pending` or `running`, sorted by `scheduledFor` desc. Used by the Watch Targets page "Running scans" section.

- **scans.listRecent** (query)  
  Args: `{ limit?: number }`.  
  Returns: most recent scan runs for the current user's targets (any status).

- **scans.get** (query)  
  Args: `{ id }, secret?`.  
  Returns: a single scan run or null (auth: must own targets in run, or valid server secret).

- **scans.getSourceStatuses** (query)  
  Args: `{ scanRunId }`.  
  Returns: per-source status rows for that run (auth: must own targets in run).

### 2.3 Scan schedule (per-target only)

- **scanSchedule.getForTarget** (query)  
  Args: `{ watchTargetId }`.  
  Returns: per-target schedule row or null (auth: must own target).

- **scanSchedule.setForTarget** (mutation)  
  Args: watchTargetId, timezone, dailyEnabled, dailyHour, dailyMinute, weeklyEnabled, weeklyDayOfWeek, weeklyHour, weeklyMinute, weekdaysOnly?, rawDescription?.  
  Upserts one row in `watchTargetSchedule` for that target.

- **scanSchedule.removeForTarget** (mutation)  
  Args: `{ watchTargetId }`.  
  Deletes the per-target schedule row if present.

### 2.4 Digests and email

- **digests.createDigestRunWithItemsFromServer** (mutation)  
  Args: secret, scanRunId, period, executiveSummary, counts, items, sourceLinksHash?.  
  Inserts digest run + items; then `ctx.scheduler.runAfter(0, internal.email.sendDigestEmail, { digestRunId })`.

- **digests.createDigestRunWithItems** (internal mutation)  
  Same shape (no secret). Same scheduler call after insert.

- **email.sendDigestEmail** (internal action)  
  Args: `{ digestRunId }`.  
  Loads digestRun → scanRun → first target → user; if `RESEND_API_KEY` set, POSTs to Resend; else logs and returns.

---

## 3. Internal Convex API (used by actions / crons)

- **digestRuns.getById** (internal query) — get digest run by id.
- **scans.getScanRun** (internal query) — get scan run by id.
- **watchTargets.getByIdsInternal** (internal query) — get watch targets by ids (no auth).
- **users.getUserById** (internal query) — get user by id (no auth).

---

## 4. HTTP APIs

### 4.1 POST /api/schedule/parse

- **Request:** `{ description: string, timezone?: string }`.
- **Response (200):** `{ timezone, dailyEnabled, dailyHour, dailyMinute, weeklyEnabled, weeklyDayOfWeek, weeklyHour, weeklyMinute, weekdaysOnly?, rawDescription? }`.
- **Errors:** 400 with `{ error }` if parse fails.

### 4.2 POST /api/scan

- Used by Convex `callScanApi` and by manual “Run scan” from UI.  
- Body may include `scanRunId`, `period`, `targetIds`, `mode` (latest | comprehensive), `sources`.  
- Creates or uses existing scan run; runs source agents; on completion with new items, may create digest via `createDigestRunWithItemsFromServer` (which triggers email).

---

## 5. Key data structures

### 5.1 watchTargetSchedule (Convex table)

- `watchTargetId`, `timezone`, `dailyEnabled`, `dailyHour`, `dailyMinute`, `weeklyEnabled`, `weeklyDayOfWeek`, `weeklyHour`, `weeklyMinute`, `weekdaysOnly?`, `rawDescription?`, `lastDailyRunDate?`, `lastWeeklyRunDate?`, `updatedAt`.
- Index: `by_watchTarget` on `watchTargetId`.

### 5.2 formatSchedule (lib/formatSchedule.ts)

- **Input:** Object with timezone, daily* and weekly* booleans/numbers, weekdaysOnly?, rawDescription?.
- **Output:** Human-readable string, e.g. `"Daily at 9:00. (America/New_York)"` or `"No automatic scans scheduled."`.

### 5.3 AddTargetForm callback

- **Props:** `onAdded?: (targetId: Id<"watchTargets">) => void`.
- **Invocation:** After successful `createTarget(...)`, component calls `onAdded?.(id)` with the returned id.

---

## 6. Environment and configuration

- **Convex env (server-side):** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_URL`. Set via `npx convex env set`. Used by `email.sendDigestEmail`.
- **Next.js env:** `SCAN_SECRET`, `NEXT_PUBLIC_APP_URL`, etc.; see `.env.example`.

---

## 7. Sequence (digest email)

1. Scan completes; API or Convex creates digest run + items.
2. Mutation calls `ctx.scheduler.runAfter(0, internal.email.sendDigestEmail, { digestRunId })`.
3. Action runs: `getById(digestRunId)` → `getScanRun(scanRunId)` → `getByIdsInternal([firstTargetId])` → `getUserById(userId)`.
4. If user has email and `RESEND_API_KEY` is set: `fetch("https://api.resend.com/emails", { method: "POST", ... })`.
5. Email body includes executive summary and link `{APP_URL}/targets/{targetId}/digests`.
