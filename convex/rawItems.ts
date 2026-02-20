import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";

const sourceValidator = v.union(
  v.literal("pubmed"),
  v.literal("clinicaltrials"),
  v.literal("edgar"),
  v.literal("exa"),
  v.literal("openfda"),
  v.literal("rss"),
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
