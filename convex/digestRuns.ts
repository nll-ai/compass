import { v } from "convex/values";
import { query } from "./_generated/server";

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("digestRuns")
      .withIndex("by_generatedAt")
      .order("desc")
      .take(limit);
  },
});

export const get = query({
  args: { id: v.id("digestRuns") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const getLatestForTarget = query({
  args: { watchTargetId: v.id("watchTargets") },
  handler: async (ctx, { watchTargetId }) => {
    const items = await ctx.db
      .query("digestItems")
      .withIndex("by_watchTarget", (q) => q.eq("watchTargetId", watchTargetId))
      .take(100);
    if (items.length === 0) return null;
    const runIds = [...new Set(items.map((i) => i.digestRunId))];
    let latest: Awaited<ReturnType<typeof ctx.db.get>> = null;
    let latestAt = 0;
    for (const id of runIds) {
      const run = await ctx.db.get(id);
      if (run && run.generatedAt > latestAt) {
        latestAt = run.generatedAt;
        latest = run;
      }
    }
    return latest;
  },
});
