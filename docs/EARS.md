# Compass — Requirements (EARS)

Requirements are written using the Easy Approach to Requirements Syntax (EARS). This document is kept in sync with the codebase when changes are requested (see [AGENTS.md](../AGENTS.md)).

**EARS patterns used:**
- **Ubiquitous:** The &lt;system&gt; shall &lt;action&gt;.
- **Event-driven:** When &lt;trigger&gt;, the &lt;system&gt; shall &lt;action&gt;.
- **State-driven:** Where &lt;state&gt;, the &lt;system&gt; shall &lt;action&gt;.
- **Optional feature:** If &lt;condition&gt;, the &lt;system&gt; shall &lt;action&gt;.
- **Unwanted behavior:** The &lt;system&gt; shall not &lt;action&gt; / When &lt;trigger&gt;, the &lt;system&gt; shall not &lt;action&gt;.

---

## 1. Add watch target and navigation

| ID | Pattern | Requirement |
|----|---------|-------------|
| R-ADD-1 | Event-driven | **When** the user successfully submits "Add Watch Target" on the add-target page, **the system shall** navigate the browser to the detail page of the newly created watch target (i.e. `/targets/{id}`). |
| R-ADD-2 | Unwanted behavior | **The system shall not** navigate to the watch targets list after a successful add when the user added a single target from the add-target page. |
| R-ADD-3 | Ubiquitous | **The system shall** pass the new watch target ID from the create mutation to the client callback so the client can perform navigation. |

---

## 2. Scan schedule placement and behavior

| ID | Pattern | Requirement |
|----|---------|-------------|
| R-SCH-1 | Ubiquitous | **The system shall** expose per-target scan schedule configuration only on the individual watch target detail page (e.g. `/targets/{id}`), in a dedicated "Scan schedule" section. |
| R-SCH-3 | Unwanted behavior | **The system shall not** show a "Scan per watch target" section or per-target schedule list on the Settings page. |
| R-SCH-4 | State-driven | **Where** a watch target has a saved per-target schedule, **the system shall** display the current schedule (e.g. "Daily at 9:00 (America/New_York)") and a control to remove it on that target’s detail page. |
| R-SCH-5 | State-driven | **Where** a watch target has no per-target schedule, **the system shall** display "No schedule set." and a form to add one (natural-language description and timezone). |
| R-SCH-6 | Ubiquitous | **The system shall** accept natural-language schedule input (e.g. "Every day at 9am") and timezone, and persist the parsed schedule for the current target via the existing Convex API (`setForTarget` / removeForTarget). |
| R-SCH-7 | Ubiquitous | **The system shall** use the schedule parsing endpoint (`/api/schedule/parse`) and format/display logic (e.g. `formatSchedule`) for per-target schedule on the target page. |

---

## 3. Digest creation and email

| ID | Pattern | Requirement |
|----|---------|-------------|
| R-DIG-1 | Event-driven | **When** a digest run is created (either from the scan API or from an internal Convex mutation), **the system shall** schedule an internal action to send a digest notification email to the owner of the watch target(s) associated with that digest. |
| R-DIG-2 | Optional feature | **If** the Convex environment variable `RESEND_API_KEY` is set, **the system shall** send the digest notification email via the Resend API to the user’s email address (resolved from the digest’s scan run → target → user). |
| R-DIG-3 | Optional feature | **If** `RESEND_API_KEY` is not set, **the system shall** not send an email and shall log that the digest email was skipped (no failure). |
| R-DIG-4 | Ubiquitous | **The system shall** resolve the recipient email from the digest run’s scan run, then the first watch target in that run, then that target’s owning user’s email. |
| R-DIG-5 | Ubiquitous | **The system shall** include in the email a short summary (e.g. executive summary) and a link to the digest view (e.g. `{APP_URL}/targets/{targetId}/digests`). |
| R-DIG-6 | Unwanted behavior | **The system shall not** block or fail digest creation if the email send fails; email delivery is best-effort. |
| R-DIG-7 | Ubiquitous | **The system shall** trigger the email send asynchronously (e.g. via Convex scheduler) so that the mutation that creates the digest does not wait on the email. |

---

## 4. Event-driven side effects (cross-cutting)

| ID | Pattern | Requirement |
|----|---------|-------------|
| R-EVT-1 | Ubiquitous | **The system shall** prefer event-driven design for side effects: when a meaningful domain event occurs (e.g. digest created), **the system shall** trigger downstream work (email, notifications) via the Convex scheduler or internal actions rather than inlining it in the same mutation or API handler. |

---

## 5. Traceability

- **HLD:** [docs/HLD.md](HLD.md) — architecture and data flow for these features.
- **LLD:** [docs/LLD.md](LLD.md) — modules, Convex functions, and APIs that implement these requirements.
