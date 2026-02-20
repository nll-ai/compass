# Compass: competitive intelligence spec

**Version 1.0 — Ormoni Bio internal**

Compass is a lightweight competitive intelligence monitoring system for small biotech teams. It watches specific drug programs and biological targets across public data sources, synthesizes new findings daily using an LLM, and delivers a curated digest to Slack — with a web UI for deeper exploration, history, and configuration.

---

## 1. Product vision and scope

The core job: *a scientist at Ormoni should never be caught flat-footed by a competitor's clinical development event.* Compass handles the surveillance and synthesis; the scientist handles the judgment.

**What Compass does:**
- Monitors named drug programs (REGN5381, LY3971297, B7-H3 ADCs, etc.) across PubMed, ClinicalTrials.gov, SEC EDGAR, FDA, and web news
- Runs daily scans, batches new findings, and generates an AI digest
- Posts the digest to Slack with smart formatting
- Provides a web UI for browsing history, configuring targets, and chatting with the AI about the data

**What Compass explicitly does not do in v1:**
- Patent monitoring (noisy, specialized; defer to v2)
- Conference abstract scraping (fragmented sources; manual add-via-URL instead)
- Multi-user auth/roles (single-tenant for now, Ormoni team uses one workspace)
- Investor call monitoring (good v2 addition; Quartr integration)

---

## 2. User flows

### 2.1 First-run setup

This is the "empty state → first value" flow. It should take under 10 minutes.

```
Landing page (empty state)
  ↓ "Get started"
Step 1: Add watch targets
  - Three pre-suggested targets shown as chips: NPR1/ANP programs, B7-H3, B7-H4
  - Each chip expands to show known programs with checkboxes
  - User can also type any drug name or target to add custom
  - "Add target" → opens inline form: name, aliases (comma separated), indication, company
  ↓ "Continue"
Step 2: Connect Slack
  - Paste Slack webhook URL
  - Select channel
  - Choose digest cadence: daily (default), weekly, or both
  - Test button → sends sample message to Slack
  ↓ "Continue"
Step 3: Run first scan
  - Summary card: "We'll scan X sources for Y programs"
  - Large "Run first scan" button
  - Live progress UI (real-time via Convex reactive query):
    □ PubMed — scanning...
    □ ClinicalTrials.gov — done (3 items found)
    □ SEC EDGAR — done (1 item found)
    □ Exa AI — scanning...
    □ openFDA — done (0 items)
  - On completion: "Found N new items. Generating digest..."
  - Streaming digest generation visible in UI
  ↓ Redirects to Dashboard
```

### 2.2 Daily Slack flow (primary value loop)

```
9 AM UTC: Compass posts digest to #compass-alerts
  ↓ Scientist reads in Slack
    — Executive summary sentence
    — Significance-coded blocks per target area
    — Each signal: headline, 2-sentence synthesis, "View →" link
  ↓ Optional: click "View →" for a specific signal
    — Opens Compass web app to that DigestItem detail page
    — Full synthesis + strategic implication + all source links
    — "Mark reviewed" button
    — Related items from past 30 days (sidebar)
```

### 2.3 Dashboard daily check-in flow

```
/dashboard
  — Summary strip: signals today / this week / critical unreviewed
  — Today's digest (expandable, inline)
  — Per-target area sections: CV programs, Oncology programs
  — Recent scan history (last 7 runs, status badges)
  — "Ask Compass" chat entry point in sidebar
```

### 2.4 Deep-dive / history flow

```
/history
  — Filterable table of all digest runs
  — Filter by: date range, therapeutic area, significance level, source type
  — Click any digest → /digest/[id]
    — Full digest detail, all items
    — Click any item → expand inline
      — Synthesis + strategic implication
      — All raw source cards (title, source badge, date, URL)
```

### 2.5 Watch target management flow

```
/targets
  — List of active watch targets (cards)
  — Per card: name, aliases, # signals (7d / 30d), last signal date
  — Click target → /targets/[id]
    — Edit form: name, aliases, indication, company, active toggle, notes
    — Signal history for this specific target
    — "Pause monitoring" toggle (soft delete, keeps history)
  — "+ Add target" button → inline drawer form
```

### 2.6 Ask Compass chat flow

```
Accessible from: sidebar in any page, or /chat
  — User types: "What's the latest on REGN5381?"
  — AI has access to tools:
      get_digest_history(targetName, days)
      get_raw_items(targetName, source, days)
      get_watch_targets()
  — Streams a response using context from Compass's own database
  — Can cite specific digest items inline
  — Persisted chat history per session (stored in Convex)
```

---

## 3. Data model

Full Convex schema. All IDs are Convex's native `v.id()` references.

```typescript
// convex/schema.ts

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({

  // ─── Core entities ───────────────────────────────────────────

  watchTargets: defineTable({
    name: v.string(),              // "REGN5381" — primary search term
    displayName: v.string(),       // "REGN5381 (Regeneron NPR1 agonist)"
    type: v.union(
      v.literal("drug"),
      v.literal("target"),         // e.g. "NPR1", "B7-H3"
      v.literal("company"),
    ),
    aliases: v.array(v.string()),  // ["dupilumab", "REGN668"] — all queried
    indication: v.optional(v.string()),
    company: v.optional(v.string()),
    therapeuticArea: v.union(
      v.literal("cardiovascular"),
      v.literal("oncology"),
      v.literal("other"),
    ),
    active: v.boolean(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_active", ["active"])
    .index("by_therapeutic_area", ["therapeuticArea"]),

  // ─── Scan infrastructure ──────────────────────────────────────

  scanRuns: defineTable({
    scheduledFor: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    period: v.union(v.literal("daily"), v.literal("weekly")),
    sourcesTotal: v.number(),
    sourcesCompleted: v.number(),
    totalItemsFound: v.number(),
    newItemsFound: v.number(),
    error: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_scheduledFor", ["scheduledFor"]),

  // Status of an individual source within a scan run
  // Allows real-time per-source progress in the UI
  scanSourceStatus: defineTable({
    scanRunId: v.id("scanRuns"),
    source: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    itemsFound: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_scanRun", ["scanRunId"]),

  // Raw retrieved items before AI processing
  rawItems: defineTable({
    scanRunId: v.id("scanRuns"),
    watchTargetId: v.id("watchTargets"),
    source: v.union(
      v.literal("pubmed"),
      v.literal("clinicaltrials"),
      v.literal("edgar"),
      v.literal("exa"),
      v.literal("openfda"),
      v.literal("rss"),
    ),
    externalId: v.string(),        // PMID, NCT#, EDGAR accession, URL hash
    title: v.string(),
    url: v.string(),
    abstract: v.optional(v.string()),
    fullText: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    metadata: v.any(),             // Source-specific: phase, status, authors, etc.
    isNew: v.boolean(),            // False if externalId seen in prior scan
    digestItemId: v.optional(v.id("digestItems")),
  })
    .index("by_scanRun", ["scanRunId"])
    .index("by_watchTarget", ["watchTargetId"])
    .index("by_externalId", ["source", "externalId"])  // dedup check
    .index("by_new", ["isNew"]),

  // ─── Digest entities ──────────────────────────────────────────

  digestRuns: defineTable({
    scanRunId: v.id("scanRuns"),
    generatedAt: v.number(),
    period: v.union(v.literal("daily"), v.literal("weekly")),
    executiveSummary: v.string(),
    totalSignals: v.number(),
    criticalCount: v.number(),
    highCount: v.number(),
    mediumCount: v.number(),
    lowCount: v.number(),
    slackPosted: v.boolean(),
    slackTs: v.optional(v.string()),  // Slack message timestamp for threading
    slackError: v.optional(v.string()),
    generationTokens: v.optional(v.number()),  // LLM cost tracking
  })
    .index("by_generatedAt", ["generatedAt"])
    .index("by_scanRun", ["scanRunId"]),

  digestItems: defineTable({
    digestRunId: v.id("digestRuns"),
    watchTargetId: v.id("watchTargets"),
    rawItemIds: v.array(v.id("rawItems")),
    category: v.union(
      v.literal("trial_update"),   // Phase change, status change, new enrollment
      v.literal("publication"),    // New paper, preprint
      v.literal("regulatory"),     // FDA designation, approval, label change
      v.literal("filing"),         // 8-K, 10-Q, press release
      v.literal("news"),           // Industry press, conference coverage
      v.literal("conference"),     // Abstract, poster, presentation
    ),
    significance: v.union(
      v.literal("critical"),   // Trial stopped/failed, approval, program kill
      v.literal("high"),       // New trial registered, key publication, phase advance
      v.literal("medium"),     // Interim data, minor protocol change, analyst report
      v.literal("low"),        // Routine update, background noise
    ),
    headline: v.string(),            // One crisp line, 80 chars max
    synthesis: v.string(),           // 2–4 sentence narrative synthesis
    strategicImplication: v.optional(v.string()),  // What this means for Ormoni
    sources: v.array(v.object({
      title: v.string(),
      url: v.string(),
      source: v.string(),
    })),
    reviewedAt: v.optional(v.number()),
  })
    .index("by_digestRun", ["digestRunId"])
    .index("by_watchTarget", ["watchTargetId"])
    .index("by_significance", ["significance"])
    .index("by_reviewed", ["reviewedAt"]),

  // ─── Configuration ────────────────────────────────────────────

  slackConfig: defineTable({
    webhookUrl: v.string(),
    channel: v.string(),
    dailyEnabled: v.boolean(),
    weeklyEnabled: v.boolean(),
    dailyHourUtc: v.number(),        // 0–23, default 9
    weeklyDayOfWeek: v.number(),     // 0=Sun, 1=Mon, default 1
    minimumSignificance: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical"),
    ),
    active: v.boolean(),
    lastTestedAt: v.optional(v.number()),
    lastTestStatus: v.optional(v.string()),
  }),

  sourceConfigs: defineTable({
    source: v.string(),
    enabled: v.boolean(),
    apiKey: v.optional(v.string()),   // Encrypted at rest
    rateLimitPerMin: v.number(),
    lastSuccessAt: v.optional(v.number()),
    consecutiveErrors: v.number(),
    lastError: v.optional(v.string()),
  })
    .index("by_source", ["source"]),

  // ─── Chat ─────────────────────────────────────────────────────

  chatSessions: defineTable({
    title: v.optional(v.string()),   // Auto-generated from first message
    createdAt: v.number(),
    lastMessageAt: v.number(),
  }),

  chatMessages: defineTable({
    sessionId: v.id("chatSessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    toolCalls: v.optional(v.any()),  // AI tool calls made during this turn
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"]),

});
```

### 3.1 Key design decisions

**Deduplication via `externalId`.** The `rawItems` table indexed on `["source", "externalId"]` is the dedup layer. Before inserting a new raw item, Compass checks for an existing record. If found, `isNew` is `false` — it gets included in context but doesn't generate a new digest item. This prevents re-alerting on the same ClinicalTrials.gov entry every day.

**`scanSourceStatus` for live progress.** Rather than a JSON blob on `scanRuns`, each source gets its own row. The UI subscribes to `useQuery(api.scans.getSourceStatuses, { scanRunId })` and renders a real-time checklist. Convex's reactive queries make this trivially simple.

**`strategicImplication` is optional and Claude-generated.** Claude only generates this field when it has enough context to make a non-generic statement. Generic implications ("this may affect Ormoni's strategy") are worse than no implication. The system prompt explicitly instructs Claude to leave this null rather than hallucinate relevance.

---

## 4. System architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Vercel (Next.js App Router)                                        │
│  ┌────────────────────┐   ┌──────────────────────────────────────┐  │
│  │ React Client       │   │ Server Components + Route Handlers   │  │
│  │ • Dashboard        │   │ • /api/chat         (AI SDK stream)  │  │
│  │ • Digest views     │   │ • /api/slack/test   (webhook test)   │  │
│  │ • Target config    │   │ • /api/cron/trigger (manual trigger) │  │
│  │ • Chat UI          │   └──────────────────────────────────────┘  │
│  └────────────────────┘                                             │
└──────────────────┬──────────────────────────────────────────────────┘
                   │ Convex React hooks (useQuery, useMutation)
                   │ HTTP actions for streaming (/api/chat)
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Convex Backend                                                     │
│  ┌──────────────────────┐   ┌────────────────────────────────────┐  │
│  │ Queries (reactive)   │   │ Scheduled Jobs (crons.ts)          │  │
│  │ • getLatestDigest    │   │ • daily   8:00 UTC → triggerScan   │  │
│  │ • getDigestHistory   │   │ • weekly  Mon 8:00 UTC → same      │  │
│  │ • getWatchTargets    │   │   (with weekly flag)               │  │
│  │ • getScanProgress    │   └────────────────────────────────────┘  │
│  └──────────────────────┘                                           │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Actions (side effects, called by cron or mutations)          │   │
│  │                                                              │   │
│  │  orchestrateScan(scanRunId)                                  │   │
│  │    ├─ scanPubMed(scanRunId, targets)                         │   │
│  │    ├─ scanClinicalTrials(scanRunId, targets)                 │   │
│  │    ├─ scanEdgar(scanRunId, targets)                          │   │
│  │    ├─ scanExa(scanRunId, targets)                            │   │
│  │    ├─ scanOpenFDA(scanRunId, targets)                        │   │
│  │    └─ scanRSS(scanRunId, targets)                            │   │
│  │                                                              │   │
│  │  generateDigest(scanRunId)        ← Vercel AI SDK here       │   │
│  │  postDigestToSlack(digestRunId)                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Convex DB (document store, real-time reactive)               │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                   │ HTTP calls from Convex Actions
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  External APIs                                                      │
│  • PubMed E-utilities (free, 10 req/sec w/ API key)                 │
│  • ClinicalTrials.gov API v2 (free, no auth)                        │
│  • SEC EDGAR full-text search (free, 10 req/sec)                    │
│  • openFDA (free, 240 req/min w/ key)                               │
│  • Exa AI (semantic web search, ~$0.002/search)                     │
│  • RSS feeds: Fierce, Endpoints, BioSpace (free)                    │
│  • Anthropic Claude API (digest generation)                         │
│  • Slack Incoming Webhooks (free)                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.1 Why Convex scheduled functions instead of Vercel Cron

Vercel Cron hits a Next.js route handler with a max timeout of 60 seconds on the Pro plan. A full scan across 6 sources for 15 targets can easily take 3–5 minutes. Convex Actions have no timeout limit and can internally `await` other actions, making them ideal for orchestrating multi-step async pipelines. The cron in Convex's `crons.ts` calls a Convex mutation that creates a `scanRun` record, then kicks off the `orchestrateScan` action — all within Convex's runtime.

### 4.2 Fan-out pattern for source scanning

`orchestrateScan` runs each source scanner as a parallel `Promise.all` rather than sequentially. Each scanner independently updates its `scanSourceStatus` row, giving the UI real-time per-source progress without complex coordination. If one source fails (e.g. Exa rate limit), the others complete normally, and the failed source is marked `"failed"` rather than blocking the digest.

---

## 5. Convex function contracts

### 5.1 Cron definition

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily digest at 8 AM UTC every day
crons.daily(
  "daily-scan",
  { hourUTC: 8, minuteUTC: 0 },
  internal.scans.scheduleScan,
  { period: "daily" }
);

// Weekly comprehensive digest every Monday at 8 AM UTC
crons.weekly(
  "weekly-scan",
  { dayOfWeek: "monday", hourUTC: 8, minuteUTC: 0 },
  internal.scans.scheduleScan,
  { period: "weekly" }
);

export default crons;
```

### 5.2 Orchestration action

```typescript
// convex/scans.ts (simplified contract)

// Mutation called by cron: creates scanRun record + kicks off action
export const scheduleScan = internalMutation({
  args: { period: v.union(v.literal("daily"), v.literal("weekly")) },
  handler: async (ctx, { period }) => {
    const scanRunId = await ctx.db.insert("scanRuns", {
      scheduledFor: Date.now(),
      status: "pending",
      period,
      sourcesTotal: 6,
      sourcesCompleted: 0,
      totalItemsFound: 0,
      newItemsFound: 0,
    });
    // Kick off the actual work as a separate action
    // (actions can't be called directly from cron, need this hop)
    await ctx.scheduler.runAfter(0, internal.scans.orchestrateScan, { scanRunId });
    return scanRunId;
  },
});

// Action: orchestrates all source scans in parallel
export const orchestrateScan = internalAction({
  args: { scanRunId: v.id("scanRuns") },
  handler: async (ctx, { scanRunId }) => {
    await ctx.runMutation(internal.scans.updateScanStatus, {
      scanRunId, status: "running", startedAt: Date.now()
    });

    const targets = await ctx.runQuery(internal.watchTargets.getActive);

    // Fan out to all source scanners in parallel
    const results = await Promise.allSettled([
      ctx.runAction(internal.sources.pubmed.scan, { scanRunId, targets }),
      ctx.runAction(internal.sources.clinicaltrials.scan, { scanRunId, targets }),
      ctx.runAction(internal.sources.edgar.scan, { scanRunId, targets }),
      ctx.runAction(internal.sources.exa.scan, { scanRunId, targets }),
      ctx.runAction(internal.sources.openfda.scan, { scanRunId, targets }),
      ctx.runAction(internal.sources.rss.scan, { scanRunId, targets }),
    ]);

    // Count totals from settled results
    const { totalFound, newFound } = aggregateResults(results);

    await ctx.runMutation(internal.scans.updateScanStatus, {
      scanRunId,
      status: "completed",
      completedAt: Date.now(),
      totalItemsFound: totalFound,
      newItemsFound: newFound,
    });

    // Only generate digest if there are new items (or weekly)
    const scan = await ctx.runQuery(internal.scans.get, { scanRunId });
    if (newFound > 0 || scan.period === "weekly") {
      await ctx.runAction(internal.digests.generate, { scanRunId });
    }
  },
});
```

### 5.3 Source scanner contract (ClinicalTrials.gov example)

```typescript
// convex/sources/clinicaltrials.ts

// Known NCT IDs for Ormoni's tracked programs — seeded at setup
// New trials discovered via keyword search get added automatically
const KNOWN_NCTS = ["NCT05116046", "NCT05504057"]; // etc.

export const scan = internalAction({
  args: { scanRunId: v.id("scanRuns"), targets: v.array(targetValidator) },
  handler: async (ctx, { scanRunId, targets }) => {
    await ctx.runMutation(internal.scans.updateSourceStatus, {
      scanRunId, source: "clinicaltrials", status: "running", startedAt: Date.now()
    });

    let itemsFound = 0;

    try {
      // 1. Poll known NCT IDs for status changes
      for (const nctId of KNOWN_NCTS) {
        const trial = await fetchCTGovTrial(nctId);
        const existingItem = await ctx.runQuery(internal.rawItems.getByExternalId, {
          source: "clinicaltrials",
          externalId: nctId,
        });

        const isChanged = existingItem
          ? detectTrialChanges(existingItem.metadata, trial)
          : true;

        if (isChanged) {
          // Find which watch target this NCT belongs to
          const targetId = matchTargetToTrial(trial, targets);
          await ctx.runMutation(internal.rawItems.upsert, {
            scanRunId,
            watchTargetId: targetId,
            source: "clinicaltrials",
            externalId: nctId,
            title: trial.protocolSection.identificationModule.officialTitle,
            url: `https://clinicaltrials.gov/study/${nctId}`,
            abstract: buildTrialAbstract(trial),
            publishedAt: parseDate(trial.protocolSection.statusModule.lastUpdatePostDate),
            metadata: extractTrialMetadata(trial),
            isNew: !existingItem,
          });
          itemsFound++;
        }
      }

      // 2. Search for new trials matching target keywords
      for (const target of targets) {
        const allTerms = [target.name, ...target.aliases].join(" OR ");
        const newTrials = await searchCTGov(allTerms, { postedAfter: daysAgo(7) });

        for (const trial of newTrials) {
          const nctId = trial.protocolSection.identificationModule.nctId;
          const exists = await ctx.runQuery(internal.rawItems.getByExternalId, {
            source: "clinicaltrials", externalId: nctId,
          });
          if (!exists) {
            await ctx.runMutation(internal.rawItems.upsert, { ...buildRawItem(trial, target), isNew: true });
            itemsFound++;
          }
        }
      }

      await ctx.runMutation(internal.scans.updateSourceStatus, {
        scanRunId, source: "clinicaltrials",
        status: "completed", completedAt: Date.now(), itemsFound,
      });
    } catch (error) {
      await ctx.runMutation(internal.scans.updateSourceStatus, {
        scanRunId, source: "clinicaltrials",
        status: "failed", error: String(error), itemsFound,
      });
    }
  },
});

// Detects meaningful changes between stored and fresh trial data
// Returns true if phase, status, enrollment, or dates changed
function detectTrialChanges(stored: TrialMetadata, fresh: CTGovTrial): boolean {
  return (
    stored.overallStatus !== fresh.protocolSection.statusModule.overallStatus ||
    stored.phase !== fresh.protocolSection.designModule?.phases?.[0] ||
    stored.enrollmentCount !== fresh.protocolSection.designModule?.enrollmentInfo?.count
  );
}
```

### 5.4 Digest generation action

```typescript
// convex/digests.ts

import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const digestItemSchema = z.object({
  watchTargetName: z.string(),
  category: z.enum(["trial_update", "publication", "regulatory", "filing", "news", "conference"]),
  significance: z.enum(["critical", "high", "medium", "low"]),
  headline: z.string().max(120).describe("One crisp line. Lead with the change, not the company."),
  synthesis: z.string().describe("2–4 sentences. What happened, what the data shows, what's notable."),
  strategicImplication: z.string().nullable().describe(
    "1–2 sentences on what this means for an NPR1/ANP agonist or B7-H3/B7-H4 developer. " +
    "Only include if genuinely specific and non-obvious. Null otherwise."
  ),
  sourceIndices: z.array(z.number()).describe("Indices into the sources array"),
});

const digestSchema = z.object({
  executiveSummary: z.string().max(300).describe(
    "2–3 sentences. Total signals found, most important 1–2 developments, overall competitive landscape pulse."
  ),
  items: z.array(digestItemSchema),
});

export const generate = internalAction({
  args: { scanRunId: v.id("scanRuns") },
  handler: async (ctx, { scanRunId }) => {

    // Fetch new raw items from this scan
    const newItems = await ctx.runQuery(internal.rawItems.getNewByScanRun, { scanRunId });
    if (newItems.length === 0) return;

    // Fetch targets for context
    const targets = await ctx.runQuery(internal.watchTargets.getActive);

    // Build context document for Claude
    const sourcesContext = newItems.map((item, i) => ({
      index: i,
      source: item.source,
      target: targets.find(t => t._id === item.watchTargetId)?.displayName ?? "Unknown",
      title: item.title,
      url: item.url,
      content: item.abstract ?? item.fullText ?? item.title,
      publishedAt: item.publishedAt ? new Date(item.publishedAt).toISOString() : null,
      metadata: item.metadata,
    }));

    const { object, usage } = await generateObject({
      model: anthropic("claude-sonnet-4-5"),
      schema: digestSchema,
      system: DIGEST_SYSTEM_PROMPT,
      prompt: `
Today's date: ${new Date().toISOString().split("T")[0]}

Active watch targets:
${targets.map(t => `- ${t.displayName} (${t.type}, ${t.therapeuticArea}${t.indication ? `, ${t.indication}` : ""})`).join("\n")}

Company context: Ormoni Bio is developing peptide therapeutics targeting NPR1/ANP axis (cardiovascular)
and B7-H3/B7-H4 checkpoint targets (oncology). They are in early clinical stage.

New items to synthesize (${newItems.length} total):
${JSON.stringify(sourcesContext, null, 2)}

Generate a structured digest. Group related items into single digest entries when they cover
the same event from multiple sources. Rank by significance. Be concise and specific — no filler language.
      `,
    });

    // Persist the digest
    const scan = await ctx.runQuery(internal.scans.get, { scanRunId });
    const digestRunId = await ctx.runMutation(internal.digests.createDigestRun, {
      scanRunId,
      period: scan.period,
      executiveSummary: object.executiveSummary,
      items: object.items,
      sourcesContext: sourcesContext,
      generationTokens: usage.totalTokens,
    });

    // Post to Slack
    const slackConfig = await ctx.runQuery(internal.settings.getSlackConfig);
    if (slackConfig?.active) {
      await ctx.runAction(internal.slack.postDigest, { digestRunId });
    }
  },
});

const DIGEST_SYSTEM_PROMPT = `
You are a competitive intelligence analyst specializing in biopharmaceuticals,
with deep expertise in cardiovascular peptide therapeutics and oncology immunology.

Your role is to synthesize raw intelligence data into actionable digests for a small
biotech leadership team. Your output will be read by scientific executives who are
time-constrained and need signal, not noise.

Formatting rules:
- Headlines: Lead with the event, not the company. "Phase 2 trial of REGN5381 enrolls first patient"
  not "Regeneron announces milestone for REGN5381"
- Synthesis: Stick to facts. Use numbers when available. Don't hedge or editorialize.
- Strategic implications: Only write these when you can say something genuinely specific
  about what this means for an NPR1/ANP agonist or B7-H3/B7-H4 developer at early clinical stage.
  The XXB750 Phase 2 failure in resistant hypertension is specifically relevant to anyone in the
  NPR1 antibody agonist class. A new SCLC approval for a B7-H3 ADC reshapes the competitive bar
  for all B7-H3 developers. Generic statements like "this may affect strategy" are not acceptable.
- Significance calibration:
  - critical: program termination, major regulatory decision, Phase 3 failure, class-defining result
  - high: new trial registered, Phase 2/3 initiation, key efficacy publication, FDA designation
  - medium: interim data readout, protocol amendment, analyst report, conference abstract
  - low: routine enrollment update, background review article, minor news mention
`.trim();
```

---

## 6. Slack integration design

Compass uses Slack Block Kit for rich, readable digests. The message structure is:

```
┌──────────────────────────────────────────────────────┐
│ 🧭 Compass — Daily digest · Feb 20, 2026             │
│                                                       │
│ 3 new signals today. One critical development in      │
│ the NPR1 class warrants immediate attention.          │
├──────────────────────────────────────────────────────┤
│ 🔴 CRITICAL · Trial update · REGN5381                │
│                                                       │
│ Regeneron's REGN5381 Phase 2 trial in HFpEF suspends │
│ enrollment pending DSMB review of interim safety data │
│                                                       │
│ The Data Safety Monitoring Board called an unplanned  │
│ review following 3 adverse events. Full enrollment    │
│ (n=240) was at 67% when suspended. Timeline and       │
│ outcome TBD.                                          │
│                                                       │
│ ⚡ For Ormoni: First safety signal in the NPR1 Ab     │
│ agonist class. Mechanism-specific or molecule-        │
│ specific risk requires watching.                      │
│                                                       │
│ [ClinicalTrials.gov ↗] [Fierce Biotech ↗]   View →   │
├──────────────────────────────────────────────────────┤
│ 🟠 HIGH · Publication · B7-H3                        │
│ ...                                                   │
├──────────────────────────────────────────────────────┤
│ 🟡 MEDIUM · News · B7-H4                             │
│ ...                                                   │
│                                                       │
│ View full digest →   Configure →                     │
└──────────────────────────────────────────────────────┘
```

The "View →" links point to `/digest/[id]#item-[itemId]` — deep-links into the web app.

### 6.1 Slack payload builder

```typescript
// convex/slack.ts

function buildSlackPayload(digest: DigestRun, items: DigestItem[], targets: WatchTarget[]) {
  const blocks = [
    // Header
    {
      type: "header",
      text: { type: "plain_text", text: `🧭 Compass — ${digest.period === "weekly" ? "Weekly" : "Daily"} digest · ${formatDate(digest.generatedAt)}` }
    },
    // Executive summary
    {
      type: "section",
      text: { type: "mrkdwn", text: digest.executiveSummary }
    },
    { type: "divider" },

    // One section per digest item
    ...items.flatMap(item => buildItemBlocks(item, targets)),

    // Footer with CTAs
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View full digest →" },
          url: `${process.env.APP_URL}/digest/${digest._id}`,
          style: "primary"
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Configure" },
          url: `${process.env.APP_URL}/settings`
        },
      ]
    }
  ];

  return { blocks };
}

function buildItemBlocks(item: DigestItem, targets: WatchTarget[]) {
  const target = targets.find(t => t._id === item.watchTargetId);
  const emoji = { critical: "🔴", high: "🟠", medium: "🟡", low: "⚪" }[item.significance];
  const categoryLabel = formatCategory(item.category);

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          `${emoji} *${item.significance.toUpperCase()}* · ${categoryLabel} · ${target?.name}`,
          "",
          `*${item.headline}*`,
          "",
          item.synthesis,
          item.strategicImplication ? `\n⚡ _${item.strategicImplication}_` : "",
          "",
          item.sources.map(s => `<${s.url}|${s.source} ↗>`).join("  ") + `  <${process.env.APP_URL}/digest/${item.digestRunId}#item-${item._id}|View →>`,
        ].filter(Boolean).join("\n")
      }
    },
    { type: "divider" }
  ];
}
```

---

## 7. UI screens and component design

### 7.1 Design language

**Typography:** Inter for UI chrome, JetBrains Mono for identifiers (drug names, NCT IDs). Large, confident type hierarchy.

**Color system:**
```
significance-critical:  #ef4444  (red-500)
significance-high:      #f97316  (orange-500)
significance-medium:    #eab308  (yellow-500)
significance-low:       #71717a  (zinc-500)

area-cardiovascular:    #3b82f6  (blue-500)
area-oncology:          #8b5cf6  (violet-500)

source-pubmed:          #e11d48  (rose-600)
source-clinicaltrials:  #0284c7  (sky-600)
source-edgar:           #1d4ed8  (blue-700)
source-exa:             #7c3aed  (violet-700)
source-fda:             #15803d  (green-700)
source-rss:             #b45309  (amber-700)
```

**Spatial system:** 4px base grid. Cards use 16px or 24px padding. Consistent 8px gaps between items. Generous whitespace — this is a reading tool, not a dashboard.

### 7.2 Component library

```
src/
  components/
    ui/                          # Primitives (from shadcn/ui)
      Badge.tsx
      Button.tsx
      Card.tsx
      Drawer.tsx
      Skeleton.tsx
      Tooltip.tsx

    compass/                     # Domain components
      SignificanceBadge.tsx      # Colored pill: CRITICAL / HIGH / MEDIUM / LOW
      CategoryBadge.tsx          # Pill: Trial Update / Publication / etc.
      SourceBadge.tsx            # Colored pill with source icon
      TargetBadge.tsx            # Pill colored by therapeutic area
      DigestItemCard.tsx         # Full signal card with expand/collapse
      DigestItemRow.tsx          # Compact row for table views
      ScanProgressCard.tsx       # Real-time scan source checklist
      DigestSummaryCard.tsx      # Compact card: date, N signals, significance breakdown
      WatchTargetCard.tsx        # Target config card with signal count
      AskCompassDrawer.tsx       # Sliding chat panel
      ExecutiveSummaryBanner.tsx # Top-of-digest banner
```

#### `DigestItemCard.tsx` — the core component

This is the most-seen component. It renders a single intelligence item, either collapsed (headline + badges) or expanded (full synthesis + sources + strategic implication).

```
┌────────────────────────────────────────────────────────────────┐
│ 🔴 CRITICAL  📋 Trial update  [REGN5381]  [Cardiovascular]     │
│                                                                 │
│ Regeneron's REGN5381 Phase 2 trial in HFpEF suspends           │
│ enrollment pending DSMB safety review ▾                        │
└────────────────────────────────────────────────────────────────┘

Expanded ▾:
┌────────────────────────────────────────────────────────────────┐
│ 🔴 CRITICAL  📋 Trial update  [REGN5381]  [Cardiovascular]     │
│ Feb 19, 2026                                                    │
│                                                                 │
│ Regeneron's REGN5381 Phase 2 trial in HFpEF suspends           │
│ enrollment pending DSMB safety review                           │
│                                                                 │
│ The Data Safety Monitoring Board called an unplanned review     │
│ following 3 serious adverse events in 160 enrolled patients.    │
│ Full planned enrollment was 240. The hold was disclosed in an   │
│ 8-K filing on Feb 19; Regeneron stated the events are being     │
│ investigated as potentially mechanism-related.                  │
│                                                                 │
│ ⚡ Strategic implication                                         │
│ First safety signal in the NPR1 antibody agonist class. If     │
│ mechanism-related, this is directly relevant to Ormoni's        │
│ peptide NPR1 agonist development strategy.                      │
│                                                                 │
│ Sources                                                         │
│ [SEC EDGAR 8-K] [ClinicalTrials.gov] [Fierce Biotech]          │
│                                                                 │
│                                          [✓ Mark reviewed]      │
└────────────────────────────────────────────────────────────────┘
```

### 7.3 Screen-by-screen breakdown

**`/` — Dashboard**

Four stat tiles at top (signals today, critical unreviewed, targets active, last scan timestamp). Below: today's digest in full (or "No new signals today — last scan at 9:02 AM" empty state). Sidebar: scan history sparkline + "Ask Compass" entry.

**`/digest/[id]`**

Executive summary banner at top (gray tinted). Below: items grouped by therapeutic area (Cardiovascular / Oncology), then sorted by significance within each group. URL hash navigation for deep-links from Slack. Breadcrumb: `Digests / Feb 20, 2026`.

**`/history`**

Table of all digest runs. Columns: date, period (daily/weekly), signals (with significance breakdown as mini-bar), Slack status. Click row → opens digest. Filter sidebar: date range, area, significance. Search bar for full-text search across headlines.

**`/targets`**

Grid of watch target cards. Each card: name, type badge, area badge, signal count (7d), last signal date, active toggle. "+ Add target" button opens a slide-over drawer. Clicking a card navigates to `/targets/[id]`.

**`/targets/[id]`**

Two-column layout. Left: edit form (name, displayName, aliases textarea, indication, company, notes, active toggle, save/delete). Right: signal history for this target only — recent digest items as compact rows, with "View in digest" links.

**`/settings`**

Three sections:
1. Slack integration (webhook URL, channel, cadence, minimum significance, test button, last test status)
2. Data sources (toggle + API key for each source, last successful run, error count)
3. About (version, last scan, total items in DB, storage usage estimate)

**`/chat`**

Full-page chat interface. Conversation list on left. Chat on right. Claude has access to three tools: `get_digest_history`, `get_watch_targets`, `search_signals`. Responses stream with typewriter effect. Citations inline as small source chips that open the source URL on click.

### 7.4 Empty states

Every list/feed has a thoughtful empty state — never just a blank area.

- **No digest yet** (first run): "Run your first scan to see intelligence here. Compass will check 6 sources for all your watch targets. →"
- **No critical signals** (filter result): "Nothing critical in this period — good news. Showing all signals instead?" with a button to clear the filter.
- **Scan failed**: Red banner: "Today's scan failed — PubMed returned an error. You can trigger a manual rescan below." with a retry button.

---

## 8. AI chat integration (Vercel AI SDK)

The chat in Compass is not a general assistant — it's a domain-specific analyst that reasons over Compass's own data. The implementation uses `streamText` with tool calling.

```typescript
// app/api/chat/route.ts

import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

export async function POST(req: Request) {
  const { messages, sessionId } = await req.json();

  const result = streamText({
    model: anthropic("claude-sonnet-4-5"),
    system: `
      You are Compass, a competitive intelligence analyst for Ormoni Bio.
      You have access to Ormoni's CI database — all past digests, raw signals,
      and watch target history. Use your tools to look up specific information
      before answering. Be specific and cite your sources.
      When you don't have data on something, say so clearly rather than speculating.
    `,
    messages,
    tools: {
      get_recent_signals: {
        description: "Get recent digest items, optionally filtered by target name, category, or significance",
        parameters: z.object({
          targetName: z.string().optional(),
          significance: z.enum(["critical", "high", "medium", "low"]).optional(),
          days: z.number().default(30),
          limit: z.number().default(10),
        }),
        execute: async ({ targetName, significance, days, limit }) => {
          return await fetchQuery(api.digestItems.search, { targetName, significance, days, limit });
        },
      },
      get_watch_targets: {
        description: "List all active watch targets with their recent signal counts",
        parameters: z.object({}),
        execute: async () => {
          return await fetchQuery(api.watchTargets.getWithStats);
        },
      },
      get_trial_history: {
        description: "Get full ClinicalTrials.gov history for a specific program — all recorded status changes",
        parameters: z.object({
          programName: z.string(),
        }),
        execute: async ({ programName }) => {
          return await fetchQuery(api.rawItems.getTrialHistory, { programName });
        },
      },
    },
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}
```

---

## 9. File and folder structure

```
compass/
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # Root layout with ConvexProvider
│   ├── page.tsx                      # Dashboard
│   ├── digest/
│   │   └── [id]/page.tsx
│   ├── history/page.tsx
│   ├── targets/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   ├── settings/page.tsx
│   ├── chat/page.tsx
│   ├── setup/page.tsx                # First-run onboarding flow
│   └── api/
│       ├── chat/route.ts             # Vercel AI SDK streaming endpoint
│       └── slack/test/route.ts       # Slack webhook test
│
├── components/
│   ├── ui/                           # shadcn/ui primitives
│   └── compass/                      # Domain components (see §7.2)
│
├── convex/
│   ├── schema.ts                     # Full DB schema (see §3)
│   ├── crons.ts                      # Scheduled job definitions
│   ├── scans.ts                      # Scan orchestration
│   ├── digests.ts                    # Digest generation + persistence
│   ├── slack.ts                      # Slack posting
│   ├── watchTargets.ts               # CRUD for watch targets
│   ├── digestItems.ts                # Digest item queries
│   ├── rawItems.ts                   # Raw item queries + dedup
│   ├── settings.ts                   # Slack config, source configs
│   ├── chat.ts                       # Chat session persistence
│   └── sources/
│       ├── pubmed.ts
│       ├── clinicaltrials.ts
│       ├── edgar.ts
│       ├── exa.ts
│       ├── openfda.ts
│       └── rss.ts
│
├── lib/
│   ├── formatters.ts                 # Date, significance, category formatters
│   ├── slack-builder.ts             # Block Kit payload builders
│   └── source-utils.ts              # Shared source helpers
│
└── env.ts                            # Typed env vars (T3 env pattern)
```

---

## 10. Environment variables

```bash
# Convex
CONVEX_DEPLOYMENT=
NEXT_PUBLIC_CONVEX_URL=

# Anthropic
ANTHROPIC_API_KEY=

# Exa AI
EXA_API_KEY=

# PubMed (optional, increases rate limit from 3 → 10 req/sec)
PUBMED_API_KEY=

# openFDA (optional, increases rate limit)
OPENFDA_API_KEY=

# App
NEXT_PUBLIC_APP_URL=https://compass.ormoni.bio

# Slack (stored in Convex DB, but needed for initial setup validation)
# SLACK_WEBHOOK_URL — stored in DB, not env
```

---

## 11. Implementation phases

### Phase 1: Core pipeline (week 1–2)

Goal: data flows from sources → Convex DB → Slack on a schedule.

- [ ] Convex schema setup + seed data (active targets pre-populated)
- [ ] `scanRuns`, `rawItems` mutations and queries
- [ ] ClinicalTrials.gov scanner (highest value source)
- [ ] PubMed scanner
- [ ] Exa AI scanner
- [ ] `generateDigest` action using `generateObject`
- [ ] Slack Block Kit posting
- [ ] Cron job wired up
- [ ] Minimal settings UI: targets list, Slack config form

**Milestone: First real digest posted to Slack, end of week 2.**

### Phase 2: Web UI (week 3)

Goal: the Slack digest links somewhere useful.

- [ ] Dashboard with today's digest
- [ ] `/digest/[id]` detail page with deep-link anchors
- [ ] `/history` table
- [ ] `/targets` management
- [ ] First-run setup flow (`/setup`)
- [ ] Live scan progress (real-time Convex query)

**Milestone: Full round-trip: Slack alert → click → web detail page.**

### Phase 3: Polish + chat (week 4)

Goal: the product feels complete and Ormoni can hand it to John.

- [ ] SEC EDGAR scanner
- [ ] openFDA scanner
- [ ] RSS feed scanner (Fierce, Endpoints, BioSpace)
- [ ] Ask Compass chat (`/chat` + streaming API route)
- [ ] "Mark reviewed" on digest items
- [ ] Error handling + retry logic for failed scans
- [ ] `/settings` source configs page
- [ ] Empty states + loading skeletons throughout
- [ ] Weekly digest variant (longer synthesis, 7-day lookback)

**Milestone: Full demo to John Casey.**

---

## 12. Key implementation risks and mitigations

**Rate limits on free APIs.** PubMed allows 10 req/sec with API key — fine for 15 targets queried once daily. ClinicalTrials.gov v2 has no documented rate limit but is well-behaved. EDGAR caps at 10 req/sec. Exa AI is metered by query count (~300/month is $1–2). Risk: scanning too aggressively during development.
*Mitigation:* All source scanners use exponential backoff with jitter. Each scanner tracks `consecutiveErrors` in `sourceConfigs` and auto-disables after 5 consecutive failures with alerting.

**LLM digest quality degrades with too many items.** Feeding 40+ raw items in one prompt causes Claude to produce generic, low-quality synthesis.
*Mitigation:* Cap items per digest at 20 most-recent/most-novel. For weekly digests with more items, use two-pass generation: first cluster by target, then synthesize each cluster.

**False positives on dedup.** A ClinicalTrials.gov trial that has a minor protocol amendment re-appears as "new" and generates a redundant alert.
*Mitigation:* The `detectTrialChanges` function checks only meaningful fields (status, phase, enrollment count). Cosmetic changes (title reformatting, contact updates) are filtered out.

**Convex action timeouts.** Convex actions have a default timeout of 2 minutes. A slow scan could exceed this.
*Mitigation:* Fan-out pattern means each source scanner is a separate action with its own 2-minute budget. The orchestrator awaits `Promise.allSettled`, which itself counts toward the orchestrator's budget — monitor and potentially switch to `ctx.scheduler.runAfter` for each source if needed.
