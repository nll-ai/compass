import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { formatSourceDate } from "./lib/formatters";

const categoryValidator = v.union(
  v.literal("trial_update"),
  v.literal("publication"),
  v.literal("regulatory"),
  v.literal("filing"),
  v.literal("news"),
  v.literal("conference"),
);
const significanceValidator = v.union(
  v.literal("critical"),
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
);

function checkDigestSecret(secret: string): boolean {
  return typeof process.env.SCAN_SECRET === "string" && process.env.SCAN_SECRET.length > 0 && secret === process.env.SCAN_SECRET;
}

export const createDigestRunWithItemsFromServer = mutation({
  args: {
    secret: v.string(),
    scanRunId: v.id("scanRuns"),
    period: v.union(v.literal("daily"), v.literal("weekly")),
    executiveSummary: v.string(),
    criticalCount: v.number(),
    highCount: v.number(),
    mediumCount: v.number(),
    lowCount: v.number(),
    items: v.array(
      v.object({
        watchTargetId: v.id("watchTargets"),
        rawItemIds: v.array(v.id("rawItems")),
        category: categoryValidator,
        significance: significanceValidator,
        headline: v.string(),
        synthesis: v.string(),
        strategicImplication: v.optional(v.string()),
        sources: v.array(v.object({ title: v.string(), url: v.string(), source: v.string(), date: v.optional(v.string()) })),
      }),
    ),
    sourceLinksHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!checkDigestSecret(args.secret)) throw new Error("Unauthorized");
    const { secret: _s, sourceLinksHash, ...rest } = args;
    const totalSignals = rest.items.length;
    const digestRunId = await ctx.db.insert("digestRuns", {
      scanRunId: rest.scanRunId,
      generatedAt: Date.now(),
      period: rest.period,
      executiveSummary: rest.executiveSummary,
      totalSignals,
      criticalCount: rest.criticalCount,
      highCount: rest.highCount,
      mediumCount: rest.mediumCount,
      lowCount: rest.lowCount,
      slackPosted: false,
      sourceLinksHash,
    });
    for (const item of rest.items) {
      await ctx.db.insert("digestItems", {
        digestRunId,
        watchTargetId: item.watchTargetId,
        rawItemIds: item.rawItemIds,
        category: item.category,
        significance: item.significance,
        headline: item.headline,
        synthesis: item.synthesis,
        strategicImplication: item.strategicImplication,
        sources: item.sources,
      });
    }
    return digestRunId;
  },
});

export const createDigestRunWithItems = internalMutation({
  args: {
    scanRunId: v.id("scanRuns"),
    period: v.union(v.literal("daily"), v.literal("weekly")),
    executiveSummary: v.string(),
    criticalCount: v.number(),
    highCount: v.number(),
    mediumCount: v.number(),
    lowCount: v.number(),
    items: v.array(
      v.object({
        watchTargetId: v.id("watchTargets"),
        rawItemIds: v.array(v.id("rawItems")),
        category: categoryValidator,
        significance: significanceValidator,
        headline: v.string(),
        synthesis: v.string(),
        strategicImplication: v.optional(v.string()),
        sources: v.array(v.object({ title: v.string(), url: v.string(), source: v.string(), date: v.optional(v.string()) })),
      }),
    ),
    sourceLinksHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const totalSignals = args.items.length;
    const digestRunId = await ctx.db.insert("digestRuns", {
      scanRunId: args.scanRunId,
      generatedAt: Date.now(),
      period: args.period,
      executiveSummary: args.executiveSummary,
      totalSignals,
      criticalCount: args.criticalCount,
      highCount: args.highCount,
      mediumCount: args.mediumCount,
      lowCount: args.lowCount,
      slackPosted: false,
      sourceLinksHash: args.sourceLinksHash,
    });
    for (const item of args.items) {
      await ctx.db.insert("digestItems", {
        digestRunId,
        watchTargetId: item.watchTargetId,
        rawItemIds: item.rawItemIds,
        category: item.category,
        significance: item.significance,
        headline: item.headline,
        synthesis: item.synthesis,
        strategicImplication: item.strategicImplication,
        sources: item.sources,
      });
    }
    return digestRunId;
  },
});

