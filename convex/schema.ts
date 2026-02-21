import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  watchTargets: defineTable({
    name: v.string(),
    displayName: v.string(),
    type: v.union(v.literal("drug"), v.literal("target"), v.literal("company")),
    aliases: v.array(v.string()),
    indication: v.optional(v.string()),
    company: v.optional(v.string()),
    therapeuticArea: v.union(
      v.literal("cardiovascular"),
      v.literal("oncology"),
      v.literal("other"),
    ),
    active: v.boolean(),
    notes: v.optional(v.string()),
    learnedQueryTerms: v.optional(v.array(v.string())),
    excludeQueryTerms: v.optional(v.array(v.string())),
    learnedTermsUpdatedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_active", ["active"])
    .index("by_therapeutic_area", ["therapeuticArea"]),

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
  }).index("by_scanRun", ["scanRunId"]),

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
      v.literal("patents"),
    ),
    externalId: v.string(),
    title: v.string(),
    url: v.string(),
    abstract: v.optional(v.string()),
    fullText: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    metadata: v.any(),
    isNew: v.boolean(),
    digestItemId: v.optional(v.id("digestItems")),
  })
    .index("by_scanRun", ["scanRunId"])
    .index("by_watchTarget", ["watchTargetId"])
    .index("by_externalId", ["source", "externalId"])
    .index("by_new", ["isNew"]),

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
    slackTs: v.optional(v.string()),
    slackError: v.optional(v.string()),
    generationTokens: v.optional(v.number()),
    /** Hash of the set of source link (raw item) IDs in this report; used to avoid duplicate reports. */
    sourceLinksHash: v.optional(v.string()),
  })
    .index("by_generatedAt", ["generatedAt"])
    .index("by_scanRun", ["scanRunId"])
    .index("by_sourceLinksHash", ["sourceLinksHash"]),

  digestItems: defineTable({
    digestRunId: v.id("digestRuns"),
    watchTargetId: v.id("watchTargets"),
    rawItemIds: v.array(v.id("rawItems")),
    category: v.union(
      v.literal("trial_update"),
      v.literal("publication"),
      v.literal("regulatory"),
      v.literal("filing"),
      v.literal("news"),
      v.literal("conference"),
    ),
    significance: v.union(
      v.literal("critical"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low"),
    ),
    headline: v.string(),
    synthesis: v.string(),
    strategicImplication: v.optional(v.string()),
    sources: v.array(
      v.object({
        title: v.string(),
        url: v.string(),
        source: v.string(),
        date: v.optional(v.string()),
      }),
    ),
    reviewedAt: v.optional(v.number()),
    feedback: v.optional(v.union(v.literal("good"), v.literal("bad"))),
    feedbackAt: v.optional(v.number()),
  })
    .index("by_digestRun", ["digestRunId"])
    .index("by_watchTarget", ["watchTargetId"])
    .index("by_significance", ["significance"])
    .index("by_reviewed", ["reviewedAt"]),

  slackConfig: defineTable({
    webhookUrl: v.string(),
    channel: v.string(),
    dailyEnabled: v.boolean(),
    weeklyEnabled: v.boolean(),
    dailyHourUtc: v.number(),
    weeklyDayOfWeek: v.number(),
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
    apiKey: v.optional(v.string()),
    rateLimitPerMin: v.number(),
    lastSuccessAt: v.optional(v.number()),
    consecutiveErrors: v.number(),
    lastError: v.optional(v.string()),
  }).index("by_source", ["source"]),

  chatSessions: defineTable({
    title: v.optional(v.string()),
    createdAt: v.number(),
    lastMessageAt: v.number(),
  }),

  chatMessages: defineTable({
    sessionId: v.id("chatSessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    toolCalls: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),

  pageContentCache: defineTable({
    url: v.string(),
    formattedContent: v.string(),
    fetchedAt: v.number(),
  }).index("by_url", ["url"]),

  /** User-configured scan schedule for all targets (singleton). */
  scanSchedule: defineTable({
    timezone: v.string(),
    dailyEnabled: v.boolean(),
    dailyHour: v.number(),
    dailyMinute: v.number(),
    weeklyEnabled: v.boolean(),
    weeklyDayOfWeek: v.number(),
    weeklyHour: v.number(),
    weeklyMinute: v.number(),
    weekdaysOnly: v.optional(v.boolean()),
    rawDescription: v.optional(v.string()),
    lastDailyRunDate: v.optional(v.string()),
    lastWeeklyRunDate: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_updatedAt", ["updatedAt"]),

  /** Per-watch-target scan schedule (one optional row per target). */
  watchTargetSchedule: defineTable({
    watchTargetId: v.id("watchTargets"),
    timezone: v.string(),
    dailyEnabled: v.boolean(),
    dailyHour: v.number(),
    dailyMinute: v.number(),
    weeklyEnabled: v.boolean(),
    weeklyDayOfWeek: v.number(),
    weeklyHour: v.number(),
    weeklyMinute: v.number(),
    weekdaysOnly: v.optional(v.boolean()),
    rawDescription: v.optional(v.string()),
    lastDailyRunDate: v.optional(v.string()),
    lastWeeklyRunDate: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_watchTarget", ["watchTargetId"])
    .index("by_updatedAt", ["updatedAt"]),
});
