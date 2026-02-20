# Compass: Competitive Intelligence Spec

**Version 1.0 — Ormoni Bio internal**

This document captures the v1 baseline product and implementation scope for Compass.

## Product Vision

Compass helps Ormoni scientists stay ahead of competitor clinical development events by:

- Monitoring named drug programs and biological targets.
- Running daily/weekly scans across public data sources.
- Synthesizing findings into LLM-generated digests.
- Delivering curated digest updates into Slack.
- Providing a web app for history, exploration, and configuration.

## In Scope (v1)

- Sources: PubMed, ClinicalTrials.gov, SEC EDGAR, openFDA, web search/news (Exa), RSS.
- Daily and weekly scan cadence.
- Digest generation with significance ranking.
- Slack Block Kit digest delivery with deep links back into web UI.
- Web routes:
  - `/` dashboard
  - `/setup` first-run onboarding
  - `/digest/[id]` digest detail
  - `/history` digest history
  - `/targets` + `/targets/[id]` watch target management
  - `/settings` integration/configuration
  - `/chat` Ask Compass

## Out of Scope (v1)

- Patent monitoring
- Conference abstract scraping
- Multi-user auth/roles
- Investor call monitoring

## Key User Flows

1. **First run setup**: add targets, connect Slack, run first scan.
2. **Daily Slack loop**: consume digest in Slack, click through to detail pages.
3. **Dashboard check-in**: scan summary, digest snapshot, scan history.
4. **History deep-dive**: filterable run history and item-level exploration.
5. **Target management**: create/edit/pause watch targets with per-target history.
6. **Ask Compass**: chat over Compass data with tool-grounded responses.

## Data Model (Convex)

Core tables and intent:

- `watchTargets`: tracked drugs/targets/companies and aliases.
- `scanRuns`: top-level run lifecycle and aggregate counts.
- `scanSourceStatus`: per-source progress/status for live UI updates.
- `rawItems`: deduped source records (`source + externalId`) and novelty marker.
- `digestRuns`: generated digest metadata, counts, and Slack post state.
- `digestItems`: synthesized signals, significance/category, source refs.
- `slackConfig`: delivery settings and test state.
- `sourceConfigs`: source toggles, keys, limits, health status.
- `chatSessions`, `chatMessages`: persisted chat history and tool-call traces.

## Architecture

- **Frontend/API:** Next.js App Router on Vercel.
- **Backend/DB:** Convex (queries/mutations/actions + scheduled jobs).
- **External APIs:** PubMed, ClinicalTrials.gov, EDGAR, openFDA, Exa, RSS, Anthropic, Slack.
- **Scheduling:** Convex cron for long-running scan orchestration.
- **Execution pattern:** Source scanners fan out in parallel with isolated status tracking.

## Core Contracts

- `scheduleScan(period)` creates a run and schedules orchestration.
- `orchestrateScan(scanRunId)` updates run status and fans out source scans.
- Source scanners write `rawItems` + `scanSourceStatus` updates.
- `generateDigest(scanRunId)` synthesizes new signals into digest items.
- `postDigestToSlack(digestRunId)` sends Block Kit payload and records delivery state.

## Digest Generation Principles

- Keep synthesis concise and factual.
- Group related source records into one signal when appropriate.
- Calibrate significance into `critical/high/medium/low`.
- Only include `strategicImplication` when it is truly specific and non-generic.
- Track token usage for cost visibility.

## Slack Message Structure

- Header (`Compass — Daily/Weekly digest`)
- Executive summary
- Ordered item blocks with significance, category, headline, synthesis, sources
- Optional strategic implication callout
- Footer actions (`View full digest`, `Configure`)

## UI Design Baseline

- Reading-first information hierarchy.
- Significance and source color coding.
- Reusable domain components:
  - `SignificanceBadge`
  - `CategoryBadge`
  - `SourceBadge`
  - `TargetBadge`
  - `DigestItemCard`
  - `ScanProgressCard`
  - `ExecutiveSummaryBanner`
  - and supporting list/summary cards.

## Environment Variables

- `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_URL`
- `OPENAI_API_KEY`
- `EXA_API_KEY`
- `PUBMED_API_KEY` (optional)
- `OPENFDA_API_KEY` (optional)
- `NEXT_PUBLIC_APP_URL`

## Planned Delivery Phases

1. **Core pipeline** (sources → DB → digest → Slack)
2. **Web UI** (dashboard/detail/history/targets/setup + deep links)
3. **Polish + chat** (additional sources, chat tools, error handling, UX polish)

## Risks and Mitigations

- **API limits:** add backoff + source health tracking.
- **Digest quality drift at high item volume:** cap inputs and/or use two-pass synthesis.
- **Dedup false positives:** compare meaningful fields only for “changed” detection.
- **Action timeout pressure:** keep fan-out scanners independent and monitor runtime budgets.

---

For the original long-form spec text used to derive this baseline, see:

- `docs/plans/2026-02-20-compass-scaffold-design.md`
