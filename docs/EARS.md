# Compass — Requirements (EARS)

Requirements are written using the Easy Approach to Requirements Syntax (EARS). This document is kept in sync with the codebase when changes are requested (see [AGENTS.md](../AGENTS.md)). It is the **bottom** of the **arrow of intent**: [HLD](HLD.md) (architecture) → [LLD](LLD.md) (implementation contracts) → **EARS** (verifiable “shall” statements). **Settings UI** layout, roles, and responsive rules are also specified in [styleguide.md](styleguide.md) §6 (Settings page); keep EARS, HLD §4.2, LLD, and the styleguide in sync when changing `/settings`. §8 links upward.

**EARS patterns used:**
- **Ubiquitous:** The &lt;system&gt; shall &lt;action&gt;.
- **Event-driven:** When &lt;trigger&gt;, the &lt;system&gt; shall &lt;action&gt;.
- **State-driven:** Where &lt;state&gt;, the &lt;system&gt; shall &lt;action&gt;.
- **Optional feature:** If &lt;condition&gt;, the &lt;system&gt; shall &lt;action&gt;.
- **Unwanted behavior:** The &lt;system&gt; shall not &lt;action&gt; / When &lt;trigger&gt;, the &lt;system&gt; shall not &lt;action&gt;.

---

## 0. Navigation and information architecture

| ID | Pattern | Requirement |
|----|---------|-------------|
| R-NAV-1 | Ubiquitous | **The system shall** use a three-item top navigation: Watch Targets, Chat, Settings. The "Compass" brand in the header links to `/targets`. |
| R-NAV-2 | Event-driven | **When** a signed-in user navigates to `/`, **the system shall** redirect to `/targets`. |
| R-NAV-3 | Event-driven | **When** a user navigates to `/dashboard` or `/history`, **the system shall** redirect to `/targets` (legacy URLs). |
| R-NAV-4 | Ubiquitous | **The system shall** present the Watch Targets page (`/targets`) as the primary hub, showing for each target: name (link to detail), type badge, therapeutic area or affiliation, latest digest snippet, and a Run scan button. |
| R-NAV-5 | Unwanted behavior | **The system shall not** show a separate Dashboard or History page in the top navigation. |
| R-NAV-6 | Ubiquitous | **The system shall** on the Settings page (`/settings`) present **sidebar tabs** (e.g. **Team** and **Digest schedule**) with a single visible panel at a time: team membership, invites, create/leave/rename in the Team panel; automatic digest schedule controls only in the Digest schedule panel (see R-SCH-1, R-TEAM-8). Tabs shall use an accessible tab pattern (tablist / tab / tabpanel). |
| R-NAV-7 | Event-driven | **When** the user opens `/settings` with a `teamInvite` query parameter and invite acceptance completes or fails, **the system shall** ensure the **Team** tab is selected so success or error feedback is visible (in addition to R-TEAM-12 acceptance semantics). |

---

## 1. Add watch target and navigation

| ID | Pattern | Requirement |
|----|---------|-------------|
| R-ADD-1 | Event-driven | **When** the user successfully submits "Add Watch Target" on the add-target page, **the system shall** navigate the browser to the detail page of the newly created watch target (i.e. `/targets/{id}`). |
| R-ADD-2 | Unwanted behavior | **The system shall not** navigate to the watch targets list after a successful add when the user added a single target from the add-target page. |
| R-ADD-3 | Ubiquitous | **The system shall** pass the new watch target ID from the create mutation to the client callback so the client can perform navigation. |

---

## 2. Digest schedule (per user only)

| ID | Pattern | Requirement |
|----|---------|-------------|
| R-SCH-1 | Ubiquitous | **The system shall** expose **automatic** digest timing **only** on the Settings page (`/settings`), in the **Digest schedule** tab/panel, persisted per signed-in user in `userDigestSchedule` via `userDigestSchedule.set` / `remove`. |
| R-SCH-2 | Unwanted behavior | **The system shall not** persist per-watch-target cron schedules, Convex APIs for per-target schedules, or a per-target schedule form on target detail pages. |
| R-SCH-3 | Ubiquitous | **The system shall** use the schedule parsing endpoint (`POST /api/schedule/parse`) and `formatSchedule` **only** for the Settings digest schedule. |
| R-SCH-4 | Ubiquitous | **The system shall** on each target detail page link users to Settings for automatic digest timing (combined scans follow the user’s global schedule). |
| R-SCH-5 | Ubiquitous | **The system shall** run cron `checkAndTrigger` against **`userDigestSchedule` only** (grouped by team + local slot or per-user when no team), scheduling combined `scheduleScan` with `digestNotifyUserIds` as today. |
| R-SCH-6 | Unwanted behavior | **The system shall not** show a separate “scan per watch target” schedule list on Settings; Settings holds one global digest schedule row per user. |
| R-SCH-7 | Unwanted behavior | **The system shall not** duplicate the digest schedule form on the Team tab; automatic timing controls belong only in the Digest schedule tab (R-NAV-6). |

---

## 3. Scan run visibility

| ID | Pattern | Requirement |
|----|---------|-------------|
| R-SCAN-1 | Ubiquitous | **The system shall** expose a list of currently pending and running scan runs on the Watch Targets page (`/targets`), scoped to **watch targets the user can see** (owned or same-team, consistent with `scans.listRunning` / `getVisibleWatchTargetIds`), showing for each run: status (pending/running), scheduled or started time, target names, and source progress (e.g. X/Y sources). |
| R-SCAN-2 | Ubiquitous | **The system shall** update the running-scans list reactively (e.g. via Convex subscription) so that when a run completes or fails, the list reflects the change without a full page reload. |
| R-SCAN-3 | Event-driven | **When** `POST /api/scan` throws after a scan run id is known, **the system shall** persist that run as **`failed`** (and close out per-source rows still `pending` or `running`) via a server-authenticated Convex mutation so the run does not remain **`running`** after the HTTP 500. |
| R-SCAN-4 | State-driven | **Where** a scan run remains **`pending`** more than **one hour** after `scheduledFor`, or **`running`** more than **30 minutes** after `startedAt` (or `scheduledFor` if `startedAt` is unset), **the system shall** mark it **`failed`** with a system explanation and close incomplete per-source rows via scheduled reconciliation (Convex cron every **15 minutes**). |
| R-SCAN-5 | Event-driven | **When** the user dismisses a pending or running scan from the Watch Targets **Running scans** list, **the system shall** mark that run **`failed`** with a user-dismiss explanation and remove it from the pending/running list, subject to the same visibility rules as `scans.listRunning`. |
| R-SCAN-6 | Ubiquitous | **The system shall** on the Watch Targets page (`/targets`) provide a **Recent scans** timeline of **completed** and **failed** scan runs for targets the user can see (same visibility as `scans.listRunning`), ordered newest first by effective time (`completedAt`, else `startedAt`, else `scheduledFor`), grouped by calendar month, with optional **View digest** when a digest run exists for that scan run. The timeline shall live in a **sidebar tab** (same tab pattern as Settings, R-NAV-6); the default tab shall be the main targets hub (lists, running scans, add target), not Recent scans. **The system shall** load that history (`listScanHistory`) only when the user is on the **Recent scans** tab and has at least one watch target (no need to load history for the default tab or when there are no targets). |
| R-SCAN-8 | Ubiquitous | **The system shall** on the Watch Targets page (`/targets`) provide a **Connections** sidebar tab (same tab pattern as **Recent scans**) that loads **`crossTargetGraph.listEdgesForViewer`** only when that tab is selected and the user has at least one watch target (not on the default tab), **shall** present shared connections **grouped by target pair** (one primary row per pair in the UI), **shall** **auto-select the first target pair** when edges exist so evidence loads until the user selects another pair, **shall** load evidence for the selected pair via **`rawItems.getByIds`** (visibility-scoped), and **shall** show that evidence with **duplicate source URLs collapsed** to a single row while retaining links to each relevant watch target. |
| R-SCAN-9 | State-driven | **Where** the signed-in user has fewer than two visible watch targets, **the system shall** on the **Connections** tab show an explanation that at least two targets are required to see shared documents. |
| R-SCAN-10 | Event-driven | **When** a scan run is marked **completed** via `scans.updateScanStatusFromServer`, **the system shall** schedule **`internal.crossTargetGraph.reconcileForWatchTargets`** for that run’s `targetIds` so `graphCrossTargetEdges` can be updated without blocking the scan HTTP response. |
| R-SCAN-11 | Ubiquitous | **The system shall** persist **`rawItems`** with at most one row per **`source` + `externalId` + `watchTargetId`**, so the same external document may appear under multiple watch targets as separate rows. |
| R-SCAN-7 | Event-driven | **When** the user activates **Re-run** on a **failed** row in **Recent scans** (and that run has `targetIds`), **the system shall** immediately **hide** that row’s stored failure message in the UI (the historical run document is unchanged), invoke **`POST /api/scan`** from the browser (same-origin `fetch`, `credentials: "include"`, no `scanRunId`) with that run’s **`period`** and **`targetIds`** and **`mode: "comprehensive"`** (same comprehensive pipeline as manual scans; target cards on this page always use **`daily`** period), creating a **new** scan run via the route, **shall** show inline success or error feedback on the Recent scans panel (no toast), **shall** restore the row’s failure message if the re-run request fails, and **shall not** require new user-facing Convex queries or mutations for retry. |

---

## 3.5 Scan initiation UI

| ID | Pattern | Requirement |
|----|---------|-------------|
| R-SCAN-UI-1 | Ubiquitous | **The system shall** present a single "Run scan" button for initiating scans from the dashboard and target detail pages. |
| R-SCAN-UI-2 | Ubiquitous | **The system shall** always run a comprehensive (deep) scan that searches all available time ranges. |
| R-SCAN-UI-3 | Ubiquitous | **The system shall** deduplicate scan results per watch target against previously collected items for that target, so digests only include new (delta) findings while allowing the same document to be stored again for a different watch target. |
| R-SCAN-UI-4 | State-driven | **Where** a scan is in progress, **the system shall** disable the scan button and show "Scanning…" with a spinner. |
| R-SCAN-UI-5 | Unwanted behavior | **The system shall not** present multiple scan buttons or scan mode options to the user. |

---

## 4. Digest creation and email

| ID | Pattern | Requirement |
|----|---------|-------------|
| R-DIG-1 | Event-driven | **When** a digest run is created (either from the scan API or from an internal Convex mutation), **the system shall** schedule an internal action to send a digest notification email to the owner of the watch target(s) associated with that digest. |
| R-DIG-2 | Optional feature | **If** the Convex environment variable `RESEND_API_KEY` is set, **the system shall** send the digest notification email via the Resend API to the user’s email address (resolved from the digest’s scan run → target → user). |
| R-DIG-3 | Optional feature | **If** `RESEND_API_KEY` is not set, **the system shall** not send an email and shall log that the digest email was skipped (no failure). |
| R-DIG-4 | Ubiquitous | **The system shall** resolve the recipient email from the digest run’s scan run, then the first watch target in that run, then that target’s owning user’s email. |
| R-DIG-5 | Ubiquitous | **The system shall** include in the email a short summary (e.g. executive summary) and a link to the digest view (e.g. `{APP_URL}/targets/{targetId}/digests`). |
| R-DIG-6 | Unwanted behavior | **The system shall not** block or fail digest creation if the email send fails; email delivery is best-effort. |
| R-DIG-7 | Ubiquitous | **The system shall** trigger the email send asynchronously (e.g. via Convex scheduler) so that the mutation that creates the digest does not wait on the email. |
| R-DIG-8 | Ubiquitous | **The system shall** send a **combined digest email** when a scan run covers multiple watch targets: HTML body with executive summary (omitted for team-filtered recipients when they have no matching digest items), per-target sections (significance, category, headline, short synthesis), links to `/targets/{id}/digests` and `/targets` (URLs validated for `href`). **When** `scanRuns.digestNotifyUserIds` is set, **the system shall** send one message per listed user (deduplicated by user id), filtering digest items to that user’s subscribed targets when the user has a `teamId`. |
| R-DIG-9 | Ubiquitous | **The system shall** keep digest synthesis **concise and factual**, calibrate significance into meaningful tiers, **merge related source records into one signal** when appropriate, and **omit or down-rank generic “strategic implication”** text unless the output is specific and material. |

---

## 4.5 Source link and timeline summaries

| ID | Pattern | Requirement |
|----|---------|-------------|
| R-SRC-1 | Ubiquitous | **The system shall** produce substantive, content-based summaries for raw items (e.g. SEC filings) when the scan pipeline can fetch content and run summarization, so the timeline and source-link overlay show what the item discloses rather than only the title or a generic form/date line. |
| R-SRC-2 | Ubiquitous | **The system shall** use full watch-target context (name, type, company, notes) when summarizing SEC filings, so summaries are relevant to the target being monitored (e.g. person-type targets get filings summarized in terms of the company’s pipeline and disclosures, not only literal name mentions). |

---

## 5. Event-driven side effects (cross-cutting)

| ID | Pattern | Requirement |
|----|---------|-------------|
| R-EVT-1 | Ubiquitous | **The system shall** prefer event-driven design for side effects: when a meaningful domain event occurs (e.g. digest created), **the system shall** trigger downstream work (email, notifications) via the Convex scheduler or internal actions rather than inlining it in the same mutation or API handler. |

---

## 6. Teams, subscriptions, and shared targets

| ID | Pattern | Requirement |
|----|---------|-------------|
| R-TEAM-1 | Ubiquitous | **The system shall not** assign users to teams by email domain on sign-in. **The system shall** set `users.teamId` only when the user **creates a team**, **accepts a valid team invite**, or (one-off migration) via `teams.runTeamBootstrap`. |
| R-TEAM-8 | Ubiquitous | **The system shall** expose **Team** controls on Settings (`/settings`) in the **Team** tab/panel (R-NAV-6): when on a team — display name (team admins: **edit and save** name), members, admin indicator, **Leave team** (with confirmation), and for team admins **invite by email**, list pending email invites (revoke). When not on a team — **pending invitations** (accept) for the signed-in email, **open invite link** (`?teamInvite=`), and **Create team** (name). **The system shall** show a short hint on Watch Targets linking to Settings when the user has no team. |
| R-TEAM-9 | Event-driven | **When** the user invokes **Leave team**, **the system shall** clear `teamId`, set `teamPreference` to `"solo"`, transfer `teams.ownerUserId` to another member when the leaver was owner and others remain, and remove `targetSubscriptions` for watch targets the user does not own. |
| R-TEAM-10 | Event-driven | **When** the user invokes **Create team** with a non-empty name and has no `teamId`, **the system shall** insert a `teams` row with `ownerUserId` set to that user and patch the user’s `teamId`. **The system shall not** allow create while the user still has a `teamId` (must leave first). |
| R-TEAM-11 | Event-driven | **When** a team admin submits a valid email to **invite teammate**, **the system shall** insert a `teamEmailInvites` row (unique token, normalized email, expiry e.g. 7 days), capped per team, reject duplicates already on the team or with a pending invite, and **schedule** `email.sendTeamInviteEmail` (Convex internal action). |
| R-TEAM-12 | Event-driven | **When** a user with no `teamId` accepts via **invite token** (e.g. from email link to Settings) or **invite id** (from pending list) and the signed-in user’s email matches the invite, **the system shall** set their `teamId`, clear `teamPreference` from `"solo"`, and mark the invite accepted. |
| R-TEAM-13 | Event-driven | **When** a team admin revokes an invite, **the system shall** mark it revoked so it can no longer be used. |
| R-TEAM-15 | Optional feature | **If** `RESEND_API_KEY` is set, **the system shall** send the team invite email via Resend with an accept link using `APP_URL` and `?teamInvite=` token; **if** it is not set, **the system shall** still create the invite row (invite may be accepted from Settings pending list when signed in as the invited email). |
| R-TEAM-14 | Event-driven | **When** a team admin submits a non-empty trimmed name for their current team, **the system shall** update `teams.name` (and `updatedAt`). **The system shall not** allow non-admins to rename the team. |
| R-TEAM-2 | Ubiquitous | **The system shall** store optional `teamId` on `users` and `watchTargets`, and `createdByUserId` on watch targets for attribution. |
| R-TEAM-3 | Ubiquitous | **The system shall** expose `targetSubscriptions` (subscribe / unsubscribe / list) so a user can opt into team watch targets for digests and scheduled scans. |
| R-TEAM-4 | Ubiquitous | **The system shall** list team watch targets on `/targets` with an “In digest” control, sections for subscribed (**In your digest**) vs team-wide targets when the user has a team, and optional “Added by {creator}” from `createdByUserId`. |
| R-TEAM-5 | Ubiquitous | **The system shall** scope visibility of targets, scans, digests, and raw items to **owned** or **same-team** targets (`canViewWatchTarget` / `getVisibleWatchTargetIds`). |
| R-TEAM-16 | Ubiquitous | **The system shall** treat `watchTargets.userId` as the **owner** for mutations: only that user may **update** or **remove** a watch target (`isWatchTargetOwner`, `watchTargets.update`, `watchTargets.remove`). Teammates may view, subscribe, and scan per other team requirements; `watchTargets.get` and `watchTargets.listAll` include **`viewerCanEdit`** so the UI can hide edit/delete for non-owners. **The system shall** expose **`watchTargets.backfillWatchTargetOwnership`** (mutation with `secret` matching Convex `MIGRATION_SECRET`) to backfill **`userId`** from **`createdByUserId`** or the reverse when one field is missing on legacy rows; return **`stillOrphanIds`** when both remain null for manual follow-up. |
| R-TEAM-5a | Ubiquitous | **The system shall** populate the Watch Targets hub list (`watchTargets.listAll`) as the **deduped union** of (a) all watch targets the user owns (`userId`) and (b) when the user has a `teamId`, all targets with that `teamId`, so owned targets remain visible if `watchTargets.teamId` is stale or unset relative to the user’s current team. |
| R-TEAM-6 | Ubiquitous | **The system shall** run the global digest cron using **subscribed** active targets for team users (and owned active targets when not on a team or without subscriptions); **when** multiple users in the same team share the same local schedule slot, **the system shall** merge into one `scheduleScan` with combined `targetIds` and `digestNotifyUserIds`. Users **without** a `teamId` **shall not** be merged with other accounts at the same slot (per-user grouping). |
| R-TEAM-7 | Optional feature | **If** `MIGRATION_SECRET` is set in Convex env, **the system shall** provide `teams.runTeamBootstrap` (mutation with matching `secret` arg) to backfill teams, `teamId` on users and targets, and owner subscriptions for one-time deploy. |

---

## 7. Researcher/Faculty as Watch Target Type

| ID | Pattern | Requirement |
|----|---------|-------------|
| R-PERSON-1 | Ubiquitous | **The system shall** accept `"person"` as a valid value for the `type` field on watch targets. |
| R-PERSON-2 | Ubiquitous | **The system shall** allow users to select "Researcher" as a watch target type when creating a new target. |
| R-PERSON-2.1 | Ubiquitous | **The system shall** identify and classify researcher/faculty names in the target lookup API, returning `type: "person"` when the query appears to be a person's name. |
| R-PERSON-3 | Optional feature | **If** the watch target type is `"person"`, **the system shall** display an optional "Affiliation" field on the create form. |
| R-PERSON-4 | Ubiquitous | **The system shall** persist the affiliation field on the watch target document. |
| R-PERSON-5 | State-driven | **Where** a watch target has type `"person"`, **the system shall** display a "Researcher" badge on the target detail page. |
| R-PERSON-6 | State-driven | **Where** a watch target has type `"person"` and an affiliation is set, **the system shall** display the affiliation on the target detail page below the name. |
| R-PERSON-7 | Ubiquitous | **The system shall** scan person-type targets using the same pipeline as other target types, searching for the target name across configured data sources. |
| R-PERSON-8 | Ubiquitous | **The system shall** include person-type targets in scheduled scans, manual scans, and digests identically to other target types. |
| R-PERSON-9 | Unwanted behavior | **The system shall not** require any migration or modification of existing watch targets when adding the person type. |

---

## 8. Traceability (arrow of intent — upward links)

- **HLD:** [docs/HLD.md](HLD.md) — architecture, data flow, and operational troubleshooting summary (§8).
- **LLD:** [docs/LLD.md](LLD.md) — modules, Convex functions, APIs, environment, and **debugging / operations** (§8).
- **Styleguide:** [docs/styleguide.md](styleguide.md) — typography, spacing, components, **Settings** and **Watch Targets** sidebar tabs (layout, a11y, responsive). User-visible Settings chrome must match the styleguide and satisfy R-NAV-6 / R-NAV-7 / R-SCH-* / R-TEAM-8; Watch Targets tab chrome must match §6 Watch Targets and R-SCAN-6 / R-SCAN-7 / R-SCAN-8 / R-SCAN-9; target ownership and read-only UI align with R-TEAM-16.

Each EARS requirement should be satisfiable against LLD contracts and HLD data flow; **Settings** and **Watch Targets** hub changes should also match the styleguide section and their traceability tables. When in doubt, update HLD, LLD, EARS, and the styleguide together.
