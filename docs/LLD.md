# Compass — Low-Level Design (LLD)

This document specifies implementation-level details: modules, Convex functions, API contracts, and key data structures. It is kept in sync with the codebase when changes are requested (see [AGENTS.md](../AGENTS.md)).

---

## 1. Module and file layout (relevant areas)

| Path | Purpose |
|------|---------|
| `app/targets/page.tsx` | **Primary hub.** Team-aware list (`listAll` with `subscribed`, `creatorLabel`), **In digest** checkbox (`targetSubscriptions`), sections for subscribed vs other team targets when `teams.getMyTeam` is set, per-card digest + scan button, **Running scans** via `scans.listRunning`. When `getMyTeam` is `null` (loaded, no team), shows a card linking to `/settings` to create or join a team. |
| `app/targets/new/page.tsx` | Add watch target page; renders `NewTargetFormSection`. |
| `app/targets/new/NewTargetFormSection.tsx` | Wraps `AddTargetForm` with `onAdded={(id) => router.push(\`/targets/${id}\`)}`. |
| `app/targets/[id]/page.tsx` | Target detail: run scan, edit target, **Automatic digest timing** card (link to Settings), insights links, source links, signal reports, delete. |
| `app/page.tsx` | Home: redirects to `/targets` if signed in, otherwise sign-in prompt. |
| `app/dashboard/page.tsx` | Legacy redirect to `/targets`. |
| `app/history/page.tsx` | Legacy redirect to `/targets`. |
| `app/settings/page.tsx` | Settings: **Team** (`getMyMembership`, `listTeamMembers`, `listMyTeamInvites`, `listPendingTeamInvitesForMyEmail`, `createTeam`, `renameTeam`, `leaveTeam`, `inviteTeamMemberByEmail`, `acceptTeamEmailInvite`, `revokeTeamInvite`, URL `?teamInvite=` handler in `Suspense`), **global digest schedule**. |
| `components/compass/AddTargetForm.tsx` | Lookup + form; calls `watchTargets.create`, then `onAdded?.(id)` with returned ID. |
| `components/compass/ScanButton.tsx` | Single "Run scan" button that always triggers comprehensive scan. Used by dashboard and target detail pages. |
| `lib/formatSchedule.ts` | `formatSchedule(schedule)` and `COMMON_TIMEZONES`; used by Settings digest schedule. |
| `lib/convexAuthQuery.ts` | `useConvexAuthQuerySkip()` — use with `useQuery(..., skip ? "skip" : {})` until `useConvexAuth()` reports authenticated, so queries don’t hang on `undefined`. |
| `convex/watchTargets.ts` | `create` (teamId, createdByUserId, auto-subscribe creator), `listAll` (team pool + `subscribed`, `creatorLabel`), `get` / `getByIds` (same-team), `update`, `remove` (cleans subscriptions), `getByIdsInternal`. |
| `convex/teams.ts` | `getMyTeam`, `getMyMembership`, `listTeamMembers`, `createTeam`, `renameTeam`, `leaveTeam`, `inviteTeamMemberByEmail`, `acceptTeamEmailInvite` (`token` \| `inviteId`), `listMyTeamInvites`, `listPendingTeamInvitesForMyEmail`, `revokeTeamInvite`, `getTeamEmailInviteEmailContextInternal`, `runTeamBootstrap`. |
| `convex/targetSubscriptions.ts` | `subscribe`, `unsubscribe`, `isSubscribed`, `listMySubscribedTargetIds`, `listSubscribersForTarget`, `getSubscribedWatchTargetIdsForUserInternal`. |
| `convex/userDigestSchedule.ts` | `get`, `set`, `remove` (per-user global digest schedule). |
| `convex/scanSchedule.ts` | `checkAndTrigger` only (cron: `userDigestSchedule` groups → `scheduleScan` + `digestNotifyUserIds`). |
| `convex/digests.ts` | `createDigestRunWithItemsFromServer`, `createDigestRunWithItems`; both schedule `internal.email.sendDigestEmail` after insert. |
| `convex/digestRuns.ts` | `getById` (internal), `getBySourceLinksHashInternal` (internal), `getBySourceLinksHashFromServer` (SCAN_SECRET), `get`, `listSignalReportsForTarget`, etc. |
| `convex/users.ts` | `getUserById` (internal). |
| `convex/email.ts` | `sendDigestEmail`, `sendTeamInviteEmail` (internal actions, `"use node"`): Resend HTML; team invite uses `APP_URL` + `?teamInvite=` token. |
| `convex/scans.ts` | `listRunning`, `listRecent`, `get`, `getSourceStatuses` (visible targets); `getScanRun` (internal), `scheduleScan` (internal, optional `digestNotifyUserIds`), `callScanApi` (internal action). No per-target schedule APIs. |
| `convex/digestItems.ts` | `listByDigestRunInternal` (for email). |
| `convex/lib/auth.ts` | `getOrCreateUserId`, `getUserIdFromIdentity`, `getVisibleWatchTargetIds`, `userOwnsTarget` (same-team). No automatic team assignment on sign-in. |
| `app/api/schedule/parse/route.ts` | POST body `{ description, timezone }` → parsed schedule fields (daily/weekly, hour, minute, weekdaysOnly, etc.). |

---

## 2. Convex public API (relevant functions)

### 2.1 Watch targets

- **watchTargets.create** (mutation)  
  Args: name, displayName, type (`"drug"` | `"target"` | `"company"` | `"person"`), therapeuticArea, aliases, indication?, company?, affiliation?, notes?, active.  
  Returns: `Id<"watchTargets">`.  
  Creates row with `userId` from `getOrCreateUserId`.  
  The `affiliation` field is optional and used for person-type targets to store institutional affiliation (e.g., "Stanford University").

- **watchTargets.get** (query)  
  Args: `{ id: string }`.  
  Returns: watch target doc or null (auth: must own or same-team target).

- **watchTargets.listAll** (query)  
  Returns: **union** of targets you own (`userId`) and, when `user.teamId` is set, targets in that team (`teamId`), deduped — so owned targets with a stale/missing `teamId` still appear after team changes. Each row includes `subscribed` and optional `creatorLabel`.

### 2.2 Scans (run visibility and status)

- **scans.listRunning** (query)  
  Args: none.  
  Returns: scan runs for **visible** targets (owned or same-team) with status `pending` or `running`.

- **scans.listRecent** (query)  
  Args: `{ limit?: number }`.  
  Returns: most recent scan runs for visible targets (any status).

- **scans.get** (query)  
  Args: `{ id }, secret?`.  
  Returns: a single scan run or null (auth: all `targetIds` must be visible, or valid server secret).

- **scans.getSourceStatuses** (query)  
  Args: `{ scanRunId }`.  
  Returns: per-source status rows for that run (auth: visible targets in run).

### 2.3 Global digest schedule (Settings)

- **userDigestSchedule.get** (query) — current user’s row or null.  
- **userDigestSchedule.set** (mutation) — upsert parsed schedule fields (+ clears last-run keys).  
- **userDigestSchedule.remove** (mutation) — delete row.

### 2.4 Cron digest schedule

- **scanSchedule.checkAndTrigger** (internal mutation)  
  Evaluates **`userDigestSchedule` only** (grouped team + timezone + slot, or per-user when no team); calls `scheduleScan` with merged `targetIds` and `digestNotifyUserIds`. No per-target table.

### 2.5 Teams and subscriptions

- **teams.getMyTeam** (query) — team doc or null.  
- **teams.getMyMembership** (query) — `{ team, teamPreference, isTeamAdmin }` for Settings (`isTeamAdmin`: `ownerUserId === user` or legacy team with no owner).  
- **teams.listTeamMembers** (query).  
- **teams.listMyTeamInvites** (query) — pending email invites for current team; admin only.  
- **teams.listPendingTeamInvitesForMyEmail** (query) — pending invites matching signed-in email when user has no `teamId`.  
- **teams.createTeam** (mutation) — `{ name }`; requires no `teamId`; sets `teams.ownerUserId`.  
- **teams.renameTeam** (mutation) — `{ name }`; team admin only; updates `teams.name`.  
- **teams.leaveTeam** (mutation) — transfers `ownerUserId` if leaver was owner; clears `teamId`, sets `teamPreference: "solo"`, prunes subs to others’ targets.  
- **teams.inviteTeamMemberByEmail** / **acceptTeamEmailInvite** / **revokeTeamInvite** — `teamEmailInvites` (email + token, TTL, revoke); accept requires JWT email match.  
- **teams.getTeamEmailInviteEmailContextInternal** (internal query) — payload for Resend.  
- **teams.runTeamBootstrap** (mutation): `secret` must match Convex `MIGRATION_SECRET`; domain backfill for legacy deploys; sets `ownerUserId` when missing; backfills targets/subs.  
- **targetSubscriptions.subscribe** / **unsubscribe** / **isSubscribed** / **listMySubscribedTargetIds** / **listSubscribersForTarget** / **getSubscribedWatchTargetIdsForUserInternal**.

### 2.6 Digests and email

- **digests.createDigestRunWithItemsFromServer** (mutation)  
  Args: secret, scanRunId, period, executiveSummary, counts, items, sourceLinksHash?.  
  Inserts digest run + items; then `ctx.scheduler.runAfter(0, internal.email.sendDigestEmail, { digestRunId })`.

- **digests.createDigestRunWithItems** (internal mutation)  
  Same shape (no secret). Same scheduler call after insert.

- **email.sendDigestEmail** (internal action)  
  Args: `{ digestRunId }`.  
  Loads digest items; uses `scanRuns.digestNotifyUserIds` when set; Resend HTML with per-target sections; subscription filter for team users via `getSubscribedWatchTargetIdsForUserInternal`.

---

## 3. Internal Convex API (used by actions / crons)

- **digestRuns.getById** (internal query) — get digest run by id.
- **digestRuns.getBySourceLinksHashInternal** (internal query) — dedupe digest insert by `sourceLinksHash` (used by `digestGenerate` action).
- **digestItems.listByDigestRunInternal** (internal query) — all items for a digest run (email).
- **scans.getScanRun** (internal query) — get scan run by id.
- **watchTargets.getByIdsInternal** (internal query) — get watch targets by ids (no auth).
- **users.getUserById** (internal query) — get user by id (no auth).
- **targetSubscriptions.getSubscribedWatchTargetIdsForUserInternal** (internal query).

---

## 4. HTTP APIs

### 4.1 POST /api/schedule/parse

- **Request:** `{ description: string, timezone?: string }`.
- **Response (200):** `{ timezone, dailyEnabled, dailyHour, dailyMinute, weeklyEnabled, weeklyDayOfWeek, weeklyHour, weeklyMinute, weekdaysOnly?, rawDescription? }`.
- **Errors:** 400 with `{ error }` if parse fails.

### 4.2 POST /api/scan

- Used by Convex `callScanApi` and by manual "Run scan" from UI.  
- **Request body:** `scanRunId?`, `period` ("daily" | "weekly"), `targetIds?`, `mode?` ("latest" | "comprehensive"), `sources?`.
  - `mode`: Defaults to "latest" if unspecified; UI-initiated scans always send "comprehensive" per R-SCAN-UI-2.
  - `sources`: Array of source IDs to run; `undefined` or empty runs all sources (see `ALL_SOURCE_IDS`).
- **Deduplication:** The endpoint fetches `existingExternalIdsBySource` before running sources and filters duplicates during `upsertRawItemsFromServer`, so only new items are stored and counted in `newFound`.
- Creates or uses existing scan run; runs source agents; on completion with new items, may create digest via `createDigestRunWithItemsFromServer` (which triggers email).
- **SEC EDGAR:** Agent path fetches filing content and summarizes for watch targets; procedural fallback uses `enrichEdgarItemsWithSummaries` (lib/scan/sources/edgar-agent) to fetch filing text and produce summaries for up to 15 items. Summaries are substantive (2–4 sentences on business/pipeline/clinical/regulatory disclosures), use full target context (name, displayName, type, company, notes, aliases) so person/company/drug targets all get relevant framing, and every successfully summarized filing gets an abstract (no filtering of "no specific disclosure"). Timeline and overlay show these content-based summaries when present.

### 4.3 POST /api/targets/lookup

- **Request:** `{ query: string }`.
- **Response (200):** `{ name, displayName, aliases, type, therapeuticArea, indication?, company?, affiliation? }`.
  - `type` is one of: `"drug"`, `"target"`, `"company"`, `"person"`.
  - `affiliation` is optional and populated for person-type targets (e.g., "Stanford University").
- **Errors:** 500 with `{ error }` if lookup fails or schema validation fails.
- Uses Exa search + GPT-4o to extract structured target information from web results.

---

## 5. Key data structures

### 5.1 watchTargets (Convex table)

- `userId`, `teamId?`, `createdByUserId?`, `name`, `displayName`, `type` (`"drug"` | `"target"` | `"company"` | `"person"`), `aliases`, `therapeuticArea`, `indication?`, `company?`, `affiliation?`, `active`, `notes?`, `learnedQueryTerms?`, `excludeQueryTerms?`, `learnedTermsUpdatedAt?`, `createdAt`, `updatedAt`.
- The `type` field supports four values: `"drug"` (pharmaceutical compounds), `"target"` (biological targets), `"company"` (biotech/pharma companies), and `"person"` (researchers/faculty).
- The `affiliation` field is optional and used for person-type targets to store institutional affiliation (e.g., "Stanford University").
- Indexes: `by_userId`, `by_teamId`, `by_active`, `by_therapeutic_area`.

### 5.2 users, teams, targetSubscriptions, userDigestSchedule, scanRuns

- **users:** `workosId`, `email`, `teamId?`, `teamPreference?` (`"solo"` after leave; no auto team on sign-in), …; indexes `by_workosId`, `by_teamId`.
- **teams:** `name`, `domain?` (legacy / bootstrap), `ownerUserId?` (admin), `createdAt`, `updatedAt`; index `by_domain`.
- **teamEmailInvites:** `teamId`, `emailLower`, `token`, `createdByUserId`, `createdAt`, `expiresAt`, `revokedAt?`, `acceptedAt?`; indexes `by_token`, `by_teamId`, `by_team_email`, `by_emailLower`.
- **targetSubscriptions:** `userId`, `watchTargetId`, `subscribedAt`; indexes `by_userId`, `by_watchTarget`, `by_user_target`.
- **userDigestSchedule:** timezone, daily/weekly fields, `weekdaysOnly?`, `rawDescription?`, last-run date keys, `userId`; index `by_userId`. Sole source of automatic scan timing.
- **scanRuns:** includes optional `digestNotifyUserIds` for combined digest email recipients.

### 5.3 formatSchedule (lib/formatSchedule.ts)

- **Input:** Object with timezone, daily* and weekly* booleans/numbers, weekdaysOnly?, rawDescription?.
- **Output:** Human-readable string, e.g. `"Daily at 9:00. (America/New_York)"` or `"No automatic scans scheduled."`.

### 5.4 AddTargetForm callback

- **Props:** `onAdded?: (targetId: Id<"watchTargets">) => void`.
- **Invocation:** After successful `createTarget(...)`, component calls `onAdded?.(id)` with the returned id.

---

## 6. Environment and configuration

- **Convex env (server-side):** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_URL`, optional `MIGRATION_SECRET` for `teams.runTeamBootstrap`. Set via `npx convex env set`. Used by `email.sendDigestEmail`.
- **Next.js env:** `SCAN_SECRET`, `NEXT_PUBLIC_APP_URL`, etc.; see `.env.example`.

---

## 7. Sequence (digest email)

1. Scan completes; API or Convex creates digest run + items.
2. Mutation calls `ctx.scheduler.runAfter(0, internal.email.sendDigestEmail, { digestRunId })`.
3. Action runs: load digest run, scan run, all digest items (`listByDigestRunInternal`), targets (`getByIdsInternal`).
4. For each recipient (`digestNotifyUserIds` or first target owner): resolve `user.email`, filter items by subscription when `user.teamId` is set.
5. If `RESEND_API_KEY` is set: POST to Resend with HTML (executive summary, per-target sections, links to `/targets/{id}/digests` and `/targets`).
