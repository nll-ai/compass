# Compass — Low-Level Design (LLD)

This document specifies implementation-level details: modules, Convex functions, API contracts, and key data structures. It is kept in sync with the codebase when changes are requested (see [AGENTS.md](../AGENTS.md)).

**Arrow of intent:** sits between [HLD](HLD.md) (what the system does at a high level) and [EARS](EARS.md) (requirements). **Settings UI** also maps to [styleguide.md](styleguide.md) §6 (see traceability table there). When you change code, update the relevant LLD tables and cross-check HLD/EARS/styleguide.

---

## 1. Module and file layout (relevant areas)

| Path | Purpose |
|------|---------|
| `app/targets/page.tsx` | **Primary hub.** Same **sidebar tab** layout as Settings (`.settings-layout`, `.settings-sidebar`, `.settings-tablist`, `.settings-tab`, `.settings-panels`): **Targets** (default), **Recent scans**, and **Connections**. **Page-level** (above the tab layout): optional **no-team** card when `teams.getMyTeam` is `null` (loaded), linking to `/settings` to create or join a team — full width, same as [styleguide.md](styleguide.md) §6 Watch Targets. **Targets** panel: scan feedback, **+ Add Watch Target**, then **In your digest** / **Team-wide targets** (when `getMyTeam` is set) or **Watch targets** (solo), per-card digest + scan; **Running scans** (`scans.listRunning`, dismiss via `scans.dismissStuckScanRun`) after the lists. Tabpanels must not use `.stack` on the same node as `[hidden]` (or rely on `.stack[hidden]` in `globals.css`). **Recent scans** panel: **only** `listScanHistory` (completed/failed), loaded when that tab is active and the user has at least one target — month groups (`.scan-history-month`, …), link to `/digest/{id}` when present; **failed** rows with `targetIds` expose **Re-run** — same shared `postManualComprehensiveScan` helper as target cards: `fetch("/api/scan", { method: "POST", credentials: "include", … })` with `period` (row’s daily/weekly; cards use **`daily`** only), `targetIds`, `mode: "comprehensive"` (omits `scanRunId` so the route creates a new run). Row `error` is hidden in the UI once Re-run starts (client state); restored if the fetch fails. Retry feedback is inline on the panel; **no** new Convex hooks for retry. **Connections** panel: `CrossTargetConnectionsPanel` renders when that tab is selected (including **zero** targets — copy explains two targets are needed); `crossTargetGraph.listEdgesForViewer` is subscribed **only** when the tab is active **and** `targets.length >= 1` (skip query otherwise). When edges exist, the panel **auto-selects the first target pair** so **Shared sources** is populated until the user picks another pair. **Refresh graph** → `crossTargetGraph.scheduleReconcileForMyVisibleTargets`. Layout: `.connections-split` responsive grid in `globals.css`. |
| `components/compass/CrossTargetConnectionsPanel.tsx` | Groups `listEdgesForViewer` rows by watch-target **pair** (one selectable row per pair with edge count + unique source badges); **Shared sources** loads merged `rawItemIds` for the pair and **deduplicates display by URL**; target links use display names. **Refresh graph** → `crossTargetGraph.scheduleReconcileForMyVisibleTargets`. Props: `skip`, `skipEdgesQuery`, `targetCount`. |
| `convex/crossTargetGraph.ts` | `listEdgesForViewer` (auth: both endpoints in `getVisibleWatchTargetIds`); `scheduleReconcileForMyVisibleTargets` (mutation → scheduler); **`reconcileForWatchTargets`** (internal mutation: upsert `graphCrossTargetEdges`). |
| `convex/lib/crossTargetLinks.ts` | `linkKeyForRawItem`, `scopeKeyForWatchTarget`, `orderedTargetPair`, `mergeRawItemIds` (cap raw ids per edge). |
| `app/targets/new/page.tsx` | Add watch target page; renders `NewTargetFormSection`. |
| `app/targets/new/NewTargetFormSection.tsx` | Wraps `AddTargetForm` with `onAdded={(id) => router.push(\`/targets/${id}\`)}`. |
| `app/digest/[id]/page.tsx` | Digest detail: optional **`DecisionBriefCard`** when run has Decision fields; list `digestItems` via **`DigestItemCard`** (workflow + comments + feedback + links); `SignalOverlay` for **View** on a signal (`components/compass/SignalOverlay.tsx`). Overlay: portal to `document.body`, slide-out panel + dimmed backdrop; on close, exit animation must clear (`transitionend` on panel `transform`, 400ms fallback) so `body` scroll lock is removed; while exiting, `pointer-events: none` on shell/backdrop/panel so opacity-0 layers do not block the page. Breadcrumb link to **Watch Targets** (`/targets`). |
| `app/targets/[id]/page.tsx` | Target detail: run scan; **edit** / **delete** only when `viewerCanEdit` from `watchTargets.get`; **Automatic digest timing** card (link to Settings), insights links, source links, signal reports. |
| `app/page.tsx` | Home: redirects to `/targets` if signed in, otherwise sign-in prompt. |
| `app/dashboard/page.tsx` | Legacy redirect to `/targets`. |
| `app/history/page.tsx` | Legacy redirect to `/targets`. |
| `app/settings/page.tsx` | Settings: **sidebar tabs** (Team, Digest schedule), default **Team**; `activeTab` state; ARIA ids `settings-tab-*` / `settings-panel-*`; **Team** panel (`getMyMembership`, `listTeamMembers`, invites, create/leave/rename); **Digest** panel (`userDigestSchedule`, `/api/schedule/parse`); `Suspense` + `SettingsTeamInviteFromUrl` for `?teamInvite=` → `acceptTeamEmailInvite`, `router.replace("/settings")` on success, callbacks switch to Team tab for messages. See [styleguide.md](styleguide.md) §6. |
| `app/globals.css` | `.settings-layout`, `.settings-sidebar`, `.settings-tablist`, `.settings-tab`, `.settings-panels` — Settings tab layout (see `docs/styleguide.md`). |
| `components/compass/AddTargetForm.tsx` | Lookup + form; calls `watchTargets.create`, then `onAdded?.(id)` with returned ID. |
| `components/compass/ScanButton.tsx` | Single "Run scan" button that always triggers comprehensive scan. Used by dashboard and target detail pages. |
| `lib/formatSchedule.ts` | `formatSchedule(schedule)` and `COMMON_TIMEZONES`; used by Settings digest schedule. |
| `lib/convexAuthQuery.ts` | `useConvexAuthQuerySkip()` — use with `useQuery(..., skip ? "skip" : {})` until `useConvexAuth()` reports authenticated, so queries don’t hang on `undefined`. |
| `convex/watchTargets.ts` | `create` (teamId, createdByUserId, auto-subscribe creator), `listAll` (**union** of owned `by_userId` + current team `by_teamId`, deduped; `subscribed`, `creatorLabel`, **`viewerCanEdit`**), `get` (extends doc with **`viewerCanEdit`**; visibility `canViewWatchTarget`), `getByIds` (visibility), `update` / `remove` (**`isWatchTargetOwner`** only), `backfillWatchTargetOwnership` (`MIGRATION_SECRET`: sync `userId` ↔ `createdByUserId`), `getByIdsInternal`. |
| `convex/teams.ts` | `getMyTeam`, `getMyMembership`, `listTeamMembers`, `createTeam`, `renameTeam`, `leaveTeam`, `inviteTeamMemberByEmail`, `acceptTeamEmailInvite` (`token` \| `inviteId`), `listMyTeamInvites`, `listPendingTeamInvitesForMyEmail`, `revokeTeamInvite`, `getTeamEmailInviteEmailContextInternal`, `runTeamBootstrap`. |
| `convex/targetSubscriptions.ts` | `subscribe`, `unsubscribe`, `isSubscribed`, `listMySubscribedTargetIds`, `listSubscribersForTarget`, `getSubscribedWatchTargetIdsForUserInternal`. |
| `convex/userDigestSchedule.ts` | `get`, `set`, `remove` (per-user global digest schedule). |
| `convex/scanSchedule.ts` | `checkAndTrigger` only (cron: `userDigestSchedule` groups → `scheduleScan` + `digestNotifyUserIds`). |
| `convex/crons.ts` | Intervals: `check-scan-schedule` (1 min) → `scanSchedule.checkAndTrigger`; `reconcile-stale-scans` (15 min) → `scans.reconcileStaleScanRuns`. |
| `convex/digests.ts` | `createDigestRunWithItemsFromServer`, `createDigestRunWithItems`; optional args `deltaSummary`, `materialitySummary`, `recommendedActionsSummary`, `confidence`; both schedule `internal.email.sendDigestEmail` after insert. |
| `convex/digestRuns.ts` | `getById` (internal), `getBySourceLinksHashInternal` (internal), `getBySourceLinksHashFromServer` (SCAN_SECRET), `get`, `listSignalReportsForTarget`, `remove` (deletes `digestItemComments` for each item, then items, then run), etc. |
| `convex/digestGenerate.ts` | Internal rule-based digest when the scan API path does not create a run; **does not** populate Decision Digest fields (those come from Next.js `generateDigestWithAI` when `DECISION_DIGEST_ENABLED=true`). |
| `convex/users.ts` | `getUserById` (internal), **`getMe`** (signed-in user `{ _id, email }` or null). |
| `convex/email.ts` | `buildDigestEmailHtml` (shared digest HTML renderer used by email action and tests), `sendDigestEmail`, `sendTeamInviteEmail` (internal actions, `"use node"`): Resend HTML; team invite uses `APP_URL` + `?teamInvite=` token. |
| `__tests__/emailDigestHtml.test.ts` | Verifies `buildDigestEmailHtml` parity (Decision brief + signal-card structure) and safety (escaped text and unsafe `href` fallback to `"#"`). |
| `convex/scans.ts` | `listRunning`, `listRecent`, `listScanHistory` (visible targets: **completed** / **failed** only; filter + sort by `completedAt` ?? `startedAt` ?? `scheduledFor`; capped read from `by_scheduledFor` then per-run `digestRuns` lookup via `by_scanRun`); `get`, `getSourceStatuses` (visible targets); `dismissStuckScanRun` (auth: visible targets, pending/running → failed); `markScanRunFailedFromServer` (`SCAN_SECRET`, run + incomplete sources); shared helper `failScanRunWithSources`; `reconcileStaleScanRuns` (internal cron: pending **1h** after `scheduledFor`, running **30m** after `startedAt` ?? `scheduledFor`); `getScanRun` (internal), `scheduleScan` (internal, optional `digestNotifyUserIds`), `callScanApi` (internal action). No per-target schedule APIs. |
| `convex/digestItems.ts` | `listByDigestRun` (`userOwnsDigestRun`), `listByWatchTarget` / `setFeedback` (`canViewWatchTarget`), **`setWorkflowStatus`**, **`setAssignee`** (assignee must be target owner or same `teamId`), **`addComment`**, **`listComments`**, `getFeedbackWithRawContent`, `listByDigestRunInternal` (email). |
| `lib/scan/digest.ts` | Digest LLM + rule-based generation; when `DECISION_DIGEST_ENABLED=true` on the Next.js server, AI path requests merged schema with Decision Digest sections (`lib/decisionDigest.ts`). |
| `lib/telemetry/decisionDigest.ts` | `trackDigestDetailViewed` — no-op unless `NEXT_PUBLIC_DIGEST_TELEMETRY=1`. |
| `eval/diff/` + `scripts/diff-eval.ts` | Offline diff corpus (YAML-first; `expected_facts` for recall, `extractedFacts` in model output for precision/unsupported-claim checks) + CLI; **score** supports `--no-judge` or LLM judge + composite `0.5×det + 0.5×judge`; **report** writes `scorecard.md` and `case_reports/<caseId>.md`. **`scripts/seed-diff-eval-corpus.ts`** seeds ≥15 cases; **`npm run diff-eval-verify`** checks corpus + optional `--with-llm` pipeline. See `eval/diff/README.md`. |
| `convex/lib/auth.ts` | `getOrCreateUserId`, `getUserIdFromIdentity`, `getVisibleWatchTargetIds`, **`canViewWatchTarget`** (same-team visibility), **`isWatchTargetOwner`** / **`watchTargetRowOwnerIs`** (row `userId` = owner for mutations), `userOwnsDigestRun`. No automatic team assignment on sign-in. |
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
  Returns: watch target document plus **`viewerCanEdit`** (`true` when current user’s id equals `userId`), or null (auth: `canViewWatchTarget` — own row or same team).

- **watchTargets.listAll** (query)  
  Returns: **union** of targets you own (`userId`) and, when `user.teamId` is set, targets in that team (`teamId`), deduped — so owned targets with a stale/missing `teamId` still appear after team changes. Each row includes `subscribed`, optional `creatorLabel`, and **`viewerCanEdit`**.

- **watchTargets.update** / **watchTargets.remove** (mutations)  
  Auth: **`isWatchTargetOwner`** only (row `userId` matches caller).

- **watchTargets.backfillWatchTargetOwnership** (mutation)  
  Args: `{ secret }` matching Convex **`MIGRATION_SECRET`**. Patches legacy rows: set `userId` from `createdByUserId` when `userId` is missing, and `createdByUserId` from `userId` when `createdByUserId` is missing. Returns counts and **`stillOrphanIds`** when both fields remain null.

### 2.2 Scans (run visibility and status)

- **scans.listRunning** (query)  
  Args: none.  
  Returns: scan runs for **visible** targets (owned or same-team) with status `pending` or `running`.

- **scans.listRecent** (query)  
  Args: `{ limit?: number }`.  
  Returns: most recent scan runs for visible targets (any status).

- **scans.listScanHistory** (query)  
  Args: `{ limit?: number }` (default 30, max 100).  
  Returns: array of **scan run documents** with an extra field `digestRunId` (`Id<"digestRuns"> | null`) for **completed** and **failed** runs only, visible targets, sorted by `completedAt ?? startedAt ?? scheduledFor` descending. `digestRunId` is set when a digest run exists for that `scanRunId` (flat shape, not nested `{ run }`, for reliable Convex serialization).

- **scans.get** (query)  
  Args: `{ id }, secret?`.  
  Returns: a single scan run or null (auth: all `targetIds` must be visible, or valid server secret).

- **scans.getSourceStatuses** (query)  
  Args: `{ scanRunId }`.  
  Returns: per-source status rows for that run (auth: visible targets in run).

- **scans.dismissStuckScanRun** (mutation)  
  Args: `{ scanRunId }`.  
  Returns: `{ ok: true }`, or `{ ok: false, reason: "already_finished" }` if the run was no longer `pending`/`running` (e.g. completed between list and click).  
  Auth: signed-in user; all run `targetIds` must be visible.  
  If the run is `pending` or `running`, patches it to `failed` with a user-dismiss message and marks any per-source rows still `pending` or `running` as `failed`. Otherwise throws **`ConvexError`** with a short user-facing message (e.g. not signed in, not found). Unexpected DB errors are wrapped in **`ConvexError`** so the client shows a message instead of a generic server error.

- **scans.markScanRunFailedFromServer** (mutation)  
  Args: `secret`, `scanRunId`, `error` (string).  
  **When** `secret` matches `SCAN_SECRET` and the run is `pending` or `running`, patches run and incomplete source rows to `failed` (used from `POST /api/scan` catch path).

- **scans.updateScanStatusFromServer** (mutation)  
  Args: `secret`, `scanRunId`, `status`, optional counters/timestamps.  
  **When** `status` is set to **`completed`** and the run has **`targetIds`**, schedules **`internal.crossTargetGraph.reconcileForWatchTargets`** (`runAfter(0, …)`) so cross-target edges stay current after scans.

### 2.2.1 Cross-target graph

- **crossTargetGraph.listEdgesForViewer** (query)  
  Args: optional `{ watchTargetId? }`.  
  Returns: edges where **both** endpoints are in **`getVisibleWatchTargetIds`**, sorted by `lastSeenAt` desc, with `displayNameA` / `displayNameB`, `linkKey`, `rawItemIds`. Empty when fewer than two visible targets.

- **crossTargetGraph.scheduleReconcileForMyVisibleTargets** (mutation)  
  Auth: signed-in user. Schedules **`reconcileForWatchTargets`** for all visible watch target ids (backfill / manual refresh).

- **rawItems.getByIds** (query)  
  Args: `{ ids: Id<"rawItems">[] }`.  
  Returns: raw item documents whose **`watchTargetId`** is in **`getVisibleWatchTargetIds`** for the signed-in user (filters unknown or non-visible ids); empty array if not signed in. Used by **`CrossTargetConnectionsPanel`** (**Shared sources**: merged `rawItemIds` for the selected pair, then **dedupe by URL** in the UI) and **`SignalOverlay`**.

- **rawItems.getExistingExternalIdsByWatchTargetFromServer** (query)  
  Args: `secret`, `sources[]`, `watchTargetIds[]`.  
  Returns: `Record<watchTargetId, Record<source, externalId[]>>` for the scan pipeline.

### 2.3 Global digest schedule (Settings)

- **userDigestSchedule.get** (query) — current user’s row or null.  
- **userDigestSchedule.set** (mutation) — upsert parsed schedule fields (+ clears last-run keys).  
- **userDigestSchedule.remove** (mutation) — delete row.

### 2.4 Cron digest schedule and stale scans

- **scanSchedule.checkAndTrigger** (internal mutation)  
  Evaluates **`userDigestSchedule` only** (grouped team + timezone + slot, or per-user when no team); calls `scheduleScan` with merged `targetIds` and `digestNotifyUserIds`. No per-target table.

- **scans.reconcileStaleScanRuns** (internal mutation)  
  No args. Finds `scanRuns` with status `pending` where `now - scheduledFor` exceeds **1 hour** (`STALE_PENDING_SCAN_MS`), or `running` where `now - (startedAt ?? scheduledFor)` exceeds **30 minutes** (`STALE_RUNNING_SCAN_MS`); marks each stale run `failed` with a system message and closes incomplete `scanSourceStatus` rows via `failScanRunWithSources`. Invoked on a **15-minute** cron (`reconcile-stale-scans`).

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
  Args: secret, scanRunId, period, executiveSummary, counts, items, sourceLinksHash?, optional **Decision Digest** fields: `deltaSummary?`, `materialitySummary?`, `strategicReadSummary?`, `recommendedActionsSummary?`, `confidence?` (`low` \| `medium` \| `high`).  
  Inserts digest run + items; then `ctx.scheduler.runAfter(0, internal.email.sendDigestEmail, { digestRunId })`.

- **digests.createDigestRunWithItems** (internal mutation)  
  Same shape (no secret), including optional Decision Digest fields. Same scheduler call after insert.

- **email.sendDigestEmail** (internal action)  
  Args: `{ digestRunId }`.  
  Loads digest items; uses `scanRuns.digestNotifyUserIds` when set; delegates HTML composition to `buildDigestEmailHtml` so rendering semantics are shared and directly testable; Resend HTML matches digest detail semantics (optional Decision brief, signals count, per-target sections, per-signal cards with significance/category pills, headline, synthesis, and source links); `href` values for app links and external source links are validated to `http`/`https` before render; subscription filter for team users via `getSubscribedWatchTargetIdsForUserInternal`.

- **email.sendTeamInviteEmail** (internal action)  
  Args: `{ inviteId }` (scheduled from `teams.inviteTeamMemberByEmail`).  
  Loads invite context via `getTeamEmailInviteEmailContextInternal`; Resend HTML with accept link `{APP_URL}/settings?teamInvite={token}` when `RESEND_API_KEY` is set.

---

## 3. Internal Convex API (used by actions / crons)

- **digestRuns.getById** (internal query) — get digest run by id.
- **digestRuns.getBySourceLinksHashInternal** (internal query) — dedupe digest insert by `sourceLinksHash` (used by `digestGenerate` action).
- **digestItems.listByDigestRunInternal** (internal query) — all items for a digest run (email).
- **scans.getScanRun** (internal query) — get scan run by id.
- **crossTargetGraph.reconcileForWatchTargets** (internal mutation) — args `{ watchTargetIds, rawPageCursor? }`; one target per scheduled job (scan completion and refresh enqueue one job per id). Walks **`rawItems` in pages** (`paginate` on `by_watchTarget`) and caps sibling rows per link (`take` on `by_externalId`) to stay under Convex read limits; chains further pages via scheduler until done.
- **scans.reconcileStaleScanRuns** (internal mutation) — stale pending/running scan cleanup (cron).
- **watchTargets.getByIdsInternal** (internal query) — get watch targets by ids (no auth).
- **users.getUserById** (internal query) — get user by id (no auth).
- **targetSubscriptions.getSubscribedWatchTargetIdsForUserInternal** (internal query).
- **teams.getTeamEmailInviteEmailContextInternal** (internal query) — payload for Resend team-invite email.
- **email.sendDigestEmail** / **email.sendTeamInviteEmail** (internal actions, `"use node"`) — Resend; digest after digest insert; team invite after `inviteTeamMemberByEmail` schedules it.

---

## 4. HTTP APIs

### 4.1 POST /api/schedule/parse

- **Request:** `{ description: string, timezone?: string }`.
- **Response (200):** `{ timezone, dailyEnabled, dailyHour, dailyMinute, weeklyEnabled, weeklyDayOfWeek, weeklyHour, weeklyMinute, weekdaysOnly?, rawDescription? }`.
- **Errors:** 400 with `{ error }` if parse fails.

### 4.2 POST /api/scan

- Used by Convex `callScanApi`, manual **Run scan** from the UI (e.g. target cards on `/targets`, target detail), and **Re-run** on failed rows in **Recent scans** (same body shape as manual UI scans: no `scanRunId` → `createRunForServer` allocates a **new** run).  
- **Request body:** `scanRunId?`, `period` ("daily" | "weekly"), `targetIds?`, `mode?` ("latest" | "comprehensive"), `sources?`, `pubmedPubDate?`.
  - `mode`: Defaults to "latest" if unspecified; UI-initiated scans always send "comprehensive" per R-SCAN-UI-2.
  - `sources`: Array of source IDs to run; `undefined` or empty runs all sources (see `ALL_SOURCE_IDS`).
  - `pubmedPubDate` (optional, PubMed only):  
    - `{ mode: "contemporaneous" | "unbounded", years?: number }` — Omitted → **contemporaneous**, last **3** years through **today** (UTC), applied server-side to PubMed `esearch` as NCBI **`YYYY/MM/DD`** with `datetype=pdat`. **`unbounded`** omits date filters.  
    - `{ mode: "range", mindate: string, maxdate: string }` — Inclusive publication-date window; each date is **`YYYY/MM/DD`** (normalized from `YYYY-MM-DD` if needed). Used for eval capture / replay and controlled diffs.  
    The PubMed tool-loop agent does **not** supply dates (avoids LLM-invented ranges); see `lib/scan/pubmed-esearch-dates.ts`.
- **Deduplication:** The endpoint fetches **`rawItems.getExistingExternalIdsByWatchTargetFromServer`** (per `watchTargetId`, per source) before running sources. **`upsertRawItemsFromServer`** inserts only when no row exists for the same **`source` + `externalId` + `watchTargetId`** (index `by_source_external_watchTarget`), so the same document can exist once per target and cross-target edges can be derived. `newFound` counts newly inserted rows.
- Creates or uses existing scan run; runs source agents; on completion with new items, may create digest via `createDigestRunWithItemsFromServer` (which triggers email).
- **Source-agent orchestration (AI SDK):** PubMed agent execution uses AI SDK **`ToolLoopAgent`** (`lib/scan/sources/pubmed-agent.ts`) with a typed `searchPubMed` tool and step stop condition; other source agents continue to use `generateText` + `tool` multi-step loops with equivalent stop conditions.
- **On uncaught errors** after a `scanRunId` is known, calls **`scans.markScanRunFailedFromServer`** so the run (and any still-incomplete source rows) is not left `running` indefinitely.
- **SEC EDGAR:** Agent path fetches filing content and summarizes for watch targets; procedural fallback uses `enrichEdgarItemsWithSummaries` (lib/scan/sources/edgar-agent) to fetch filing text and produce summaries for up to 15 items. Summaries are substantive (2–4 sentences on business/pipeline/clinical/regulatory disclosures), use full target context (name, displayName, type, company, notes, aliases) so person/company/drug targets all get relevant framing, and every successfully summarized filing gets an abstract (no filtering of "no specific disclosure"). Timeline and overlay show these content-based summaries when present.

### 4.2.1 POST /api/scan/pubmed

- **Purpose:** Programmatic PubMed-only scan for a single existing watch target (same auth and scan pipeline as `POST /api/scan`, implemented via shared `lib/scan/runScanPipeline.ts`).
- **Auth:** Same as `POST /api/scan` — `Authorization: Bearer <SCAN_SECRET>` or same-origin browser request; `SCAN_SECRET` must match Convex.
- **Request body:** `{ watchTargetId: string, period?: "daily" | "weekly", mode?: "latest" | "comprehensive", pubmedPubDate?: { mode: "contemporaneous" | "unbounded", years?: number } | { mode: "range", mindate: string, maxdate: string } }`.
  - Defaults: `period` → `"daily"`, `mode` → `"comprehensive"` (aligned with UI “Run scan”). `pubmedPubDate` omitted → same as `POST /api/scan` (contemporaneous, 3 years).
  - Internally runs with `sources: ["pubmed"]` and `targetIds: [watchTargetId]`.
- **Response (200):** Same shape as `POST /api/scan` success: `{ ok: true, scanRunId, totalFound, newFound, failedSources? }`.

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

### 5.3 digestRuns, digestItems, digestItemComments

- **digestRuns:** `scanRunId`, `watchTargetId`, `period`, `executiveSummary`, `counts`, `sourceLinksHash?`, `createdAt`, optional **Decision Digest** fields: `deltaSummary?`, `materialitySummary?`, `strategicReadSummary?`, `recommendedActionsSummary?`, `confidence?` (`"low"` \| `"medium"` \| `"high"`). Index `by_scanRun`.
- **digestItems:** per-signal row for a digest run; optional workflow: `workflowStatus?` (`"open"` \| `"in_review"` \| `"resolved"`), `assigneeUserId?`, `workflowUpdatedAt?`. Indexes include `by_digestRun`.
- **digestItemComments:** `digestItemId`, `authorUserId`, `body`, `createdAt`; index **`by_digestItem`** on `["digestItemId", "createdAt"]`. Deleted when a digest run is removed (`digestRuns.remove`).

### 5.4 rawItems and graphCrossTargetEdges

- **rawItems:** Indexes include **`by_source_external_watchTarget`** on `["source", "externalId", "watchTargetId"]` for per-target dedup; **`by_externalId`** on `["source", "externalId"]` for cross-target sibling lookup. Internal helpers: **`getByExternalIdForTarget`**, **`listBySourceAndExternalId`**. Server upsert uses per-target existence checks.
- **graphCrossTargetEdges:** `scopeKey`, `watchTargetIdA` / `watchTargetIdB` (ordered), `linkKind` (`shared_external_id`), `linkKey` (e.g. `pubmed:123`), `rawItemIds[]`, `lastSeenAt`. Indexes: **`by_scope_targets_key`**, **`by_watchTargetA`**, **`by_watchTargetB`**.

### 5.5 formatSchedule (lib/formatSchedule.ts)

- **Input:** Object with timezone, `daily*` and `weekly*` schedule booleans/numbers, weekdaysOnly?, rawDescription?.
- **Output:** Human-readable string, e.g. `"Daily at 9:00. (America/New_York)"` or `"No automatic scans scheduled."`.

### 5.6 AddTargetForm callback

- **Props:** `onAdded?: (targetId: Id<"watchTargets">) => void`.
- **Invocation:** After successful `createTarget(...)`, component calls `onAdded?.(id)` with the returned id.

---

## 6. Environment and configuration

- **Convex env (server-side):** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_URL` (digest links, team invite accept links, and **must be reachable by Convex** when `callScanApi` hits `POST /api/scan`), `SCAN_SECRET` (**must match** Next.js / Vercel), optional `MIGRATION_SECRET` for `teams.runTeamBootstrap`. Set via `npx convex env set` (use **`--prod`** for production deployment).
- **Next.js env:** `SCAN_SECRET`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_APP_URL`, **`GROQ_API_KEY`** (LLM via `@ai-sdk/groq`; default model **GPT-OSS 120B** / `openai/gpt-oss-120b`; optional `GROQ_MODEL_FAST` / `GROQ_MODEL_SMART`), WorkOS keys, etc.; see `.env.example`. Optional product flags: **`DECISION_DIGEST_ENABLED`**, **`NEXT_PUBLIC_DIGEST_TELEMETRY`**. **Convex cloud:** set **`GROQ_API_KEY`** (and optional model vars) for `watchTargets` learned-query refresh (`refreshLearnedTermsForTarget` internal action).
- **Local vs remote Convex:** If `.env.local` has `CONVEX_DEPLOYMENT` starting with `local:`, the CLI/backend is local; otherwise cloud. Local Convex + local Next: `APP_URL` can be `http://localhost:3000`. Remote Convex cannot call `localhost`; use a deployed URL or tunnel.

---

## 7. Sequence (digest email)

1. Scan completes; API or Convex creates digest run + items.
2. Mutation calls `ctx.scheduler.runAfter(0, internal.email.sendDigestEmail, { digestRunId })`.
3. Action runs: load digest run, scan run, all digest items (`listByDigestRunInternal`), targets (`getByIdsInternal`).
4. For each recipient (`digestNotifyUserIds` or first target owner): resolve `user.email`, filter items by subscription when `user.teamId` is set.
5. If `RESEND_API_KEY` is set: POST to Resend with HTML (executive summary, optional **Decision brief** block when run fields are set, top-level signals count, per-target sections, per-signal cards with source links, and links to `/targets/{id}/digests` and `/targets`).

---

## 8. Debugging and operations

### 8.1 Convex logs (scheduled scan bridge)

From the repo root:

```bash
npx convex logs --history 100
# Production deployment:
npx convex logs --prod --history 200
npx convex env list --prod
npx convex dashboard --prod
```

Interpret:

| Observation | Likely cause |
|---------------|----------------|
| No `scans:callScanApi` near the scheduled time | Cron not running, or `checkAndTrigger` / schedule slot / timezone mismatch. |
| `callScanApi: APP_URL or SCAN_SECRET not set` | Set both in Convex env for that deployment. |
| `callScanApi failed: 401` | `SCAN_SECRET` differs between Convex and Next.js. |
| `callScanApi failed: 500` | Next.js `/api/scan` threw — see §8.2. |

### 8.2 Next.js `/api/scan` errors

Generic 500 bodies are normal; the **root cause** is logged server-side:

- **Local:** Terminal running `npm run dev` — search for **`[POST /api/scan] error:`** and stack.
- **Vercel:** Project → Logs / Functions — same string.

### 8.3 Local vs remote matrix

| Scenario | Where Convex runs | `APP_URL` in Convex | Where to read Next error |
|----------|-------------------|------------------------|---------------------------|
| Local Convex + local Next | Your machine | `http://localhost:3000` | `npm run dev` terminal |
| Remote Convex + deployed Next | Cloud | `https://…` (your app) | Vercel (or host) logs |
| Remote Convex + local Next | Cloud | Public URL to your machine (e.g. tunnel) | Local terminal |

### 8.4 `sendDigestEmail` log messages (prod)

After a digest is created, search logs for **`email:sendDigestEmail`**:

| Log | Meaning |
|-----|--------|
| `sendDigestEmail: started` | Action entered. |
| `RESEND_API_KEY not set, skipping` | Set key on this deployment. |
| `digest run not found, skipping` | Bad id or deleted row. |
| `no scan run or targetIds, skipping` | Scan run missing or empty. |
| `no target or userId` / `no user or user email` | Data / WorkOS sync issue. |
| `sending` → `sent successfully` | Resend accepted. |
| `Resend API error` | Non-2xx from Resend; body in log. |

### 8.5 Deploy / API mismatch

**`Could not find public function for 'scans:listRunning'`** (or similar) → Production Convex schema/functions behind the app. Deploy Convex (`npx convex deploy`, or CI hook); see README / Vercel build notes if applicable.

### 8.6 Watch targets list empty (data still present)

If the hub is empty but direct `/targets/{id}` works for owned targets, historical cause was **list** logic using only `by_teamId` when the user had a `teamId` that did not match `watchTargets.teamId` on owned rows. **Current behavior:** `listAll` unions **owned** + **current team** (see §2.1). Optional: backfill `watchTargets.teamId` for sharing.
