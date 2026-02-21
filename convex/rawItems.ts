import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";

const sourceValidator = v.union(
  v.literal("pubmed"),
  v.literal("clinicaltrials"),
  v.literal("edgar"),
  v.literal("exa"),
  v.literal("openfda"),
  v.literal("rss"),
  v.literal("patents"),
);

const rawItemInputValidator = v.object({
  watchTargetId: v.id("watchTargets"),
  externalId: v.string(),
  title: v.string(),
  url: v.string(),
  abstract: v.optional(v.string()),
  fullText: v.optional(v.string()),
  publishedAt: v.optional(v.number()),
  metadata: v.any(),
});

export const getByExternalId = internalQuery({
  args: { source: sourceValidator, externalId: v.string() },
  handler: async (ctx, { source, externalId }) => {
    const item = await ctx.db
      .query("rawItems")
      .withIndex("by_externalId", (q) => q.eq("source", source).eq("externalId", externalId))
      .first();
    return item;
  },
});

export const getNewByScanRun = internalQuery({
  args: { scanRunId: v.id("scanRuns") },
  handler: async (ctx, { scanRunId }) => {
    return await ctx.db
      .query("rawItems")
      .withIndex("by_scanRun", (q) => q.eq("scanRunId", scanRunId))
      .filter((q) => q.eq(q.field("isNew"), true))
      .collect();
  },
});

export const insertRawItem = internalMutation({
  args: {
    scanRunId: v.id("scanRuns"),
    watchTargetId: v.id("watchTargets"),
    source: sourceValidator,
    externalId: v.string(),
    title: v.string(),
    url: v.string(),
    abstract: v.optional(v.string()),
    fullText: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    metadata: v.any(),
    isNew: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("rawItems", args);
  },
});

function checkSecret(secret: string): boolean {
  return typeof process.env.SCAN_SECRET === "string" && process.env.SCAN_SECRET.length > 0 && secret === process.env.SCAN_SECRET;
}

export const upsertRawItemsFromServer = mutation({
  args: {
    secret: v.string(),
    scanRunId: v.id("scanRuns"),
    source: sourceValidator,
    items: v.array(rawItemInputValidator),
  },
  handler: async (ctx, { secret, scanRunId, source, items }) => {
    if (!checkSecret(secret)) return { totalFound: 0, newFound: 0 };
    let totalFound = 0;
    let newFound = 0;
    for (const item of items) {
      const existing = await ctx.db
        .query("rawItems")
        .withIndex("by_externalId", (q) => q.eq("source", source).eq("externalId", item.externalId))
        .first();
      const isNew = !existing;
      if (existing) continue;
      await ctx.db.insert("rawItems", {
        scanRunId,
        watchTargetId: item.watchTargetId,
        source,
        externalId: item.externalId,
        title: item.title,
        url: item.url,
        abstract: item.abstract,
        fullText: item.fullText,
        publishedAt: item.publishedAt,
        metadata: item.metadata ?? {},
        isNew,
      });
      totalFound++;
      if (isNew) newFound++;
    }
    return { totalFound, newFound };
  },
});

export const getNewByScanRunFromServer = query({
  args: { secret: v.string(), scanRunId: v.id("scanRuns") },
  handler: async (ctx, { secret, scanRunId }) => {
    if (!checkSecret(secret)) return [];
    return await ctx.db
      .query("rawItems")
      .withIndex("by_scanRun", (q) => q.eq("scanRunId", scanRunId))
      .filter((q) => q.eq(q.field("isNew"), true))
      .collect();
  },
});

/** Return existing external IDs per source so agents can prioritize items not yet in signals. */
export const getExistingExternalIdsFromServer = query({
  args: { secret: v.string(), sources: v.array(v.string()) },
  handler: async (ctx, { secret, sources }) => {
    if (!checkSecret(secret)) return {} as Record<string, string[]>;
    const out: Record<string, string[]> = {};
    for (const source of sources) {
      const items = await ctx.db
        .query("rawItems")
        .filter((q) => q.eq(q.field("source"), source))
        .collect();
      out[source] = [...new Set(items.map((i) => i.externalId))];
    }
    return out;
  },
});

/** List Source Links (raw items) for a watch target, newest first. Optionally filter by source(s) for timeline/insight views. When excludeHidden is true, items with thumbs-down feedback are omitted. */
export const listByWatchTarget = query({
  args: {
    watchTargetId: v.id("watchTargets"),
    limit: v.optional(v.number()),
    sources: v.optional(v.array(v.string())),
    excludeHidden: v.optional(v.boolean()),
  },
  handler: async (ctx, { watchTargetId, limit = 100, sources, excludeHidden }) => {
    let items = await ctx.db
      .query("rawItems")
      .withIndex("by_watchTarget", (q) => q.eq("watchTargetId", watchTargetId))
      .collect();
    if (sources != null && sources.length > 0) {
      const set = new Set(sources);
      items = items.filter((i) => set.has(i.source));
    }
    if (excludeHidden) {
      const hidden = await ctx.db
        .query("sourceLinkFeedback")
        .withIndex("by_feedback", (q) => q.eq("feedback", "bad"))
        .collect();
      const hiddenIds = new Set(hidden.map((h) => h.rawItemId));
      items = items.filter((i) => !hiddenIds.has(i._id));
    }
    items.sort((a, b) => (b.publishedAt ?? b._creationTime) - (a.publishedAt ?? a._creationTime));
    return items.slice(0, limit);
  },
});

/** Get raw items by ids for showing original page content in the UI (e.g. overlay). */
export const getByIds = query({
  args: { ids: v.array(v.id("rawItems")) },
  handler: async (ctx, { ids }) => {
    const results = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return results.filter((r) => r != null);
  },
});
