import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  /**
   * Workspace / sharing boundary. Created explicitly in Settings; `ownerUserId` is team admin.
   * `domain` optional — legacy rows only (old domain-based bootstrap).
   */
  teams: defineTable({
    name: v.string(),
    domain: v.optional(v.string()),
    ownerUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_domain", ["domain"]),

  /**
   * Email invite to join a team. Recipient accepts in Settings (link with token) or by invite id when signed in as that email.
   */
  teamEmailInvites: defineTable({
    teamId: v.id("teams"),
    emailLower: v.string(),
    /** Opaque token for accept URL (unguessable). */
    token: v.string(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_teamId", ["teamId"])
    .index("by_team_email", ["teamId", "emailLower"])
    .index("by_emailLower", ["emailLower"]),

  /** Users from WorkOS; created on first sign-in. */
  users: defineTable({
    workosId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    teamId: v.optional(v.id("teams")),
    /** `solo`: left a team; no auto team assignment (users are not placed on a team until create or invite). */
    teamPreference: v.optional(v.union(v.literal("solo"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workosId", ["workosId"])
    .index("by_teamId", ["teamId"]),

  watchTargets: defineTable({
    userId: v.optional(v.id("users")),
    teamId: v.optional(v.id("teams")),
    /** User who created the target (attribution). */
    createdByUserId: v.optional(v.id("users")),
    name: v.string(),
    displayName: v.string(),
    type: v.union(v.literal("drug"), v.literal("target"), v.literal("company"), v.literal("person")),
    aliases: v.array(v.string()),
    indication: v.optional(v.string()),
    company: v.optional(v.string()),
    therapeuticArea: v.union(
      v.literal("cardiovascular"),
      v.literal("oncology"),
      v.literal("other"),
    ),
    active: v.boolean(),
    affiliation: v.optional(v.string()),
    notes: v.optional(v.string()),
    learnedQueryTerms: v.optional(v.array(v.string())),
    excludeQueryTerms: v.optional(v.array(v.string())),
    learnedTermsUpdatedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_teamId", ["teamId"])
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
    /** Targets included in this run; used to scope listRecent by user. */
    targetIds: v.optional(v.array(v.id("watchTargets"))),
    /** When set, digest email is sent to these users (e.g. global schedule owner); each gets a filtered view by subscription in team mode. */
    digestNotifyUserIds: v.optional(v.array(v.id("users"))),
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
      v.literal("biorxiv"),
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
    .index("by_source_external_watchTarget", ["source", "externalId", "watchTargetId"])
    .index("by_new", ["isNew"]),

  /**
   * Phase 1 cross-watch-target graph: same source document (external id) appears under two+ monitored targets
   * in the same workspace (team or solo user scope). Provenance is rawItem ids.
   */
  graphCrossTargetEdges: defineTable({
    /** `team:<id>` or `user:<id>` — must match for both watch targets. */
    scopeKey: v.string(),
    watchTargetIdA: v.id("watchTargets"),
    watchTargetIdB: v.id("watchTargets"),
    linkKind: v.literal("shared_external_id"),
    /** e.g. `pubmed:12345678` */
    linkKey: v.string(),
    rawItemIds: v.array(v.id("rawItems")),
    lastSeenAt: v.number(),
  })
    .index("by_scope_targets_key", ["scopeKey", "watchTargetIdA", "watchTargetIdB", "linkKey"])
    .index("by_watchTargetA", ["watchTargetIdA"])
    .index("by_watchTargetB", ["watchTargetIdB"]),

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
    /** Decision Digest: what changed vs prior context (optional; older runs omit). */
    deltaSummary: v.optional(v.string()),
    materialitySummary: v.optional(v.string()),
    recommendedActionsSummary: v.optional(v.string()),
    /** Interpretive lane: posture / market or scientific read vs prior digests; hypotheses labeled in text. */
    strategicReadSummary: v.optional(v.string()),
    confidence: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
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
    workflowStatus: v.optional(
      v.union(v.literal("open"), v.literal("in_review"), v.literal("resolved")),
    ),
    assigneeUserId: v.optional(v.id("users")),
    workflowUpdatedAt: v.optional(v.number()),
  })
    .index("by_digestRun", ["digestRunId"])
    .index("by_watchTarget", ["watchTargetId"])
    .index("by_significance", ["significance"])
    .index("by_reviewed", ["reviewedAt"]),

  /** Comments on a digest signal item; visible to users who can view the item’s watch target. */
  digestItemComments: defineTable({
    digestItemId: v.id("digestItems"),
    authorUserId: v.id("users"),
    body: v.string(),
    createdAt: v.number(),
  }).index("by_digestItem", ["digestItemId"]),

  slackConfig: defineTable({
    userId: v.optional(v.id("users")),
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
  }).index("by_userId", ["userId"]),

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
    userId: v.optional(v.id("users")),
    title: v.optional(v.string()),
    createdAt: v.number(),
    lastMessageAt: v.number(),
  }).index("by_userId", ["userId"]),

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

  /** Thumbs up/down on source links (raw items). Thumbs down = hide from timeline. */
  sourceLinkFeedback: defineTable({
    rawItemId: v.id("rawItems"),
    feedback: v.union(v.literal("good"), v.literal("bad")),
    updatedAt: v.number(),
  })
    .index("by_rawItem", ["rawItemId"])
    .index("by_feedback", ["feedback"]),

  /** Per-user digest / combined scan schedule (Settings). One row per user when configured. */
  userDigestSchedule: defineTable({
    userId: v.id("users"),
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
  }).index("by_userId", ["userId"]),

  /** User opts in to team watch targets for digests and scans. */
  targetSubscriptions: defineTable({
    userId: v.id("users"),
    watchTargetId: v.id("watchTargets"),
    subscribedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_watchTarget", ["watchTargetId"])
    .index("by_user_target", ["userId", "watchTargetId"]),
});
