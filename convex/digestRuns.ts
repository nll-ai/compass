import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getOrCreateUserId, getUserIdFromIdentity } from "./lib/auth";

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return [];
    const userTargets = await ctx.db
      .query("watchTargets")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const userTargetIdSet = new Set(userTargets.map((t) => t._id));
    const limit = args.limit ?? 20;
    const all = await ctx.db
      .query("digestRuns")
      .withIndex("by_generatedAt")
      .order("desc")
      .take(limit * 3);
    const filtered: Doc<"digestRuns">[] = [];
    for (const run of all) {
      const scanRun = await ctx.db.get(run.scanRunId);
      if (
        scanRun?.targetIds?.length &&
        scanRun.targetIds.every((id) => userTargetIdSet.has(id))
      ) {
        filtered.push(run);
        if (filtered.length >= limit) break;
      }
    }
    return filtered;
  },
});

export const get = query({
  args: { id: v.id("digestRuns") },
  handler: async (ctx, { id }) => {
    const run = await ctx.db.get(id);
    if (!run) return null;
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return null;
    const scanRun = await ctx.db.get(run.scanRunId);
    if (!scanRun?.targetIds?.length) return null;
    const userTargets = await ctx.db
      .query("watchTargets")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const userSet = new Set(userTargets.map((t) => t._id));
    if (!scanRun.targetIds.every((tid) => userSet.has(tid))) return null;
    return run;
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

/** List Signal Reports (digest runs) that include this watch target, newest first. Caller must own the target. */
export const listSignalReportsForTarget = query({
  args: { watchTargetId: v.id("watchTargets"), limit: v.optional(v.number()) },
  handler: async (ctx, { watchTargetId, limit = 20 }) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return [];
    const target = await ctx.db.get(watchTargetId);
    if (!target || target.userId !== userId) return [];
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
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return null;
    const target = await ctx.db.get(watchTargetId);
    if (!target || target.userId !== userId) return null;
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

/** Delete a digest run and all its digest items. Caller must own the run. */
export const remove = mutation({
  args: { id: v.id("digestRuns") },
  handler: async (ctx, { id }) => {
    const run = await ctx.db.get(id);
    if (!run) return { deleted: false };
    const userId = await getOrCreateUserId(ctx);
    const scanRun = await ctx.db.get(run.scanRunId);
    if (!scanRun?.targetIds?.length) {
      throw new Error("Unauthorized");
    }
    const userTargets = await ctx.db
      .query("watchTargets")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const userSet = new Set(userTargets.map((t) => t._id));
    if (!scanRun.targetIds.every((tid) => userSet.has(tid))) {
      throw new Error("Unauthorized");
    }
    const items = await ctx.db
      .query("digestItems")
      .withIndex("by_digestRun", (q) => q.eq("digestRunId", id))
      .collect();
    for (const item of items) {
      await ctx.db.delete(item._id);
    }
    await ctx.db.delete(id);
    return { deleted: true };
  },
});
