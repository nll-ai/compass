# Compass — Requirements (EARS)

Requirements are written using the Easy Approach to Requirements Syntax (EARS). This document is kept in sync with the codebase when changes are requested (see [AGENTS.md](../AGENTS.md)).

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
| R-SCH-1 | Ubiquitous | **The system shall** expose **automatic** digest timing **only** on the Settings page (`/settings`), persisted per signed-in user in `userDigestSchedule` via `userDigestSchedule.set` / `remove`. |
| R-SCH-2 | Unwanted behavior | **The system shall not** persist per-watch-target cron schedules, Convex APIs for per-target schedules, or a per-target schedule form on target detail pages. |
| R-SCH-3 | Ubiquitous | **The system shall** use the schedule parsing endpoint (`POST /api/schedule/parse`) and `formatSchedule` **only** for the Settings digest schedule. |
| R-SCH-4 | Ubiquitous | **The system shall** on each target detail page link users to Settings for automatic digest timing (combined scans follow the user’s global schedule). |
| R-SCH-5 | Ubiquitous | **The system shall** run cron `checkAndTrigger` against **`userDigestSchedule` only** (grouped by team + local slot or per-user when no team), scheduling combined `scheduleScan` with `digestNotifyUserIds` as today. |
| R-SCH-6 | Unwanted behavior | **The system shall not** show a separate “scan per watch target” schedule list on Settings; Settings holds one global digest schedule row per user. |

---

## 3. Scan run visibility

| ID | Pattern | Requirement |
|----|---------|-------------|
| R-SCAN-1 | Ubiquitous | **The system shall** expose a list of currently pending and running scan runs on the Watch Targets page (`/targets`), scoped to the current user's watch targets, showing for each run: status (pending/running), scheduled or started time, target names, and source progress (e.g. X/Y sources). |
| R-SCAN-2 | Ubiquitous | **The system shall** update the running-scans list reactively (e.g. via Convex subscription) so that when a run completes or fails, the list reflects the change without a full page reload. |

---

## 3.5 Scan initiation UI

| ID | Pattern | Requirement |
|----|---------|-------------|
| R-SCAN-UI-1 | Ubiquitous | **The system shall** present a single "Run scan" button for initiating scans from the dashboard and target detail pages. |
| R-SCAN-UI-2 | Ubiquitous | **The system shall** always run a comprehensive (deep) scan that searches all available time ranges. |
| R-SCAN-UI-3 | Ubiquitous | **The system shall** deduplicate scan results against previously collected items, so digests only include new (delta) findings. |
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
| R-TEAM-8 | Ubiquitous | **The system shall** expose **Team** on Settings (`/settings`): when on a team — display name (team admins: **edit and save** name), members, admin indicator, **Leave team** (with confirmation), and for team admins **invite by email**, list pending email invites (revoke). When not on a team — **pending invitations** (accept) for the signed-in email, **open invite link** (`?teamInvite=`), and **Create team** (name). **The system shall** show a short hint on Watch Targets linking to Settings when the user has no team. |
| R-TEAM-9 | Event-driven | **When** the user invokes **Leave team**, **the system shall** clear `teamId`, set `teamPreference` to `"solo"`, transfer `teams.ownerUserId` to another member when the leaver was owner and others remain, and remove `targetSubscriptions` for watch targets the user does not own. |
| R-TEAM-10 | Event-driven | **When** the user invokes **Create team** with a non-empty name and has no `teamId`, **the system shall** insert a `teams` row with `ownerUserId` set to that user and patch the user’s `teamId`. **The system shall not** allow create while the user still has a `teamId` (must leave first). |
| R-TEAM-11 | Event-driven | **When** a team admin submits a valid email to **invite teammate**, **the system shall** insert a `teamEmailInvites` row (unique token, normalized email, expiry e.g. 7 days), capped per team, reject duplicates already on the team or with a pending invite, and **schedule** `email.sendTeamInviteEmail` (Convex internal action). |
| R-TEAM-12 | Event-driven | **When** a user with no `teamId` accepts via **invite token** (e.g. from email link to Settings) or **invite id** (from pending list) and the signed-in user’s email matches the invite, **the system shall** set their `teamId`, clear `teamPreference` from `"solo"`, and mark the invite accepted. |
| R-TEAM-13 | Event-driven | **When** a team admin revokes an invite, **the system shall** mark it revoked so it can no longer be used. |
| R-TEAM-15 | Optional feature | **If** `RESEND_API_KEY` is set, **the system shall** send the team invite email via Resend with an accept link using `APP_URL` and `?teamInvite=` token; **if** it is not set, **the system shall** still create the invite row (invite may be accepted from Settings pending list when signed in as the invited email). |
| R-TEAM-14 | Event-driven | **When** a team admin submits a non-empty trimmed name for their current team, **the system shall** update `teams.name` (and `updatedAt`). **The system shall not** allow non-admins to rename the team. |
| R-TEAM-2 | Ubiquitous | **The system shall** store optional `teamId` on `users` and `watchTargets`, and `createdByUserId` on watch targets for attribution. |
| R-TEAM-3 | Ubiquitous | **The system shall** expose `targetSubscriptions` (subscribe / unsubscribe / list) so a user can opt into team watch targets for digests and scheduled scans. |
| R-TEAM-4 | Ubiquitous | **The system shall** list team watch targets on `/targets` with an “In digest” control, sections for subscribed vs other team targets when the user has a team, and optional “Added by {creator}” from `createdByUserId`. |
| R-TEAM-5 | Ubiquitous | **The system shall** scope visibility of targets, scans, digests, and raw items to **owned** or **same-team** targets (`userOwnsTarget` / `getVisibleWatchTargetIds`). |
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

## 8. Traceability

- **HLD:** [docs/HLD.md](HLD.md) — architecture and data flow for these features.
- **LLD:** [docs/LLD.md](LLD.md) — modules, Convex functions, and APIs that implement these requirements.
