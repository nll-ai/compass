import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

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

/** Find an existing Signal Report (digest run) by hash of its source links; used to avoid duplicate reports. */
export const getBySourceLinksHash = query({
  args: { sourceLinksHash: v.string() },
  handler: async (ctx, { sourceLinksHash }) => {
    return await ctx.db
      .query("digestRuns")
      .withIndex("by_sourceLinksHash", (q) => q.eq("sourceLinksHash", sourceLinksHash))
      .first();
  },
});

/** List Signal Reports (digest runs) that include this watch target, newest first. */
export const listSignalReportsForTarget = query({
  args: { watchTargetId: v.id("watchTargets"), limit: v.optional(v.number()) },
  handler: async (ctx, { watchTargetId, limit = 20 }) => {
    const items = await ctx.db
      .query("digestItems")
      .withIndex("by_watchTarget", (q) => q.eq("watchTargetId", watchTargetId))
      .take(limit * 3);
    const runIds = [...new Set(items.map((i) => i.digestRunId))];
    const fetched = await Promise.all(runIds.map((runId: Id<"digestRuns">) => ctx.db.get(runId)));
    const runs = fetched.filter((r): r is Doc<"digestRuns"> => r != null);
    runs.sort((a, b) => b.generatedAt - a.generatedAt);
    return runs.slice(0, limit);
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
