import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalQuery, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  canViewWatchTarget,
  getOrCreateUserId,
  getUserIdFromIdentity,
  getVisibleWatchTargetIds,
} from "./lib/auth";

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return [];
    const visible = await getVisibleWatchTargetIds(ctx, userId);
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
        scanRun.targetIds.every((id) => visible.has(id))
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
    const visible = await getVisibleWatchTargetIds(ctx, userId);
    if (!scanRun.targetIds.every((tid) => visible.has(tid))) return null;
    return run;
  },
});

/** Internal: get digest run by id (no auth). Used by email action. */
export const getById = internalQuery({
  args: { id: v.id("digestRuns") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

function checkScanSecret(secret: string): boolean {
  return (
    typeof process.env.SCAN_SECRET === "string" &&
    process.env.SCAN_SECRET.length > 0 &&
    secret === process.env.SCAN_SECRET
  );
}

/** Internal: dedupe digest creation by source-links hash. */
export const getBySourceLinksHashInternal = internalQuery({
  args: { sourceLinksHash: v.string() },
  handler: async (ctx, { sourceLinksHash }) => {
    return await ctx.db
      .query("digestRuns")
      .withIndex("by_sourceLinksHash", (q) => q.eq("sourceLinksHash", sourceLinksHash))
      .first();
  },
});

/** Server-only: same lookup, gated by `SCAN_SECRET` (POST /api/scan). Not callable without secret. */
export const getBySourceLinksHashFromServer = query({
  args: { secret: v.string(), sourceLinksHash: v.string() },
  handler: async (ctx, { secret, sourceLinksHash }) => {
    if (!checkScanSecret(secret)) return null;
    return await ctx.db
      .query("digestRuns")
      .withIndex("by_sourceLinksHash", (q) => q.eq("sourceLinksHash", sourceLinksHash))
      .first();
  },
});

/** List Signal Reports (digest runs) that include this watch target, newest first. Caller must own or same-team see the target. */
export const listSignalReportsForTarget = query({
  args: { watchTargetId: v.id("watchTargets"), limit: v.optional(v.number()) },
  handler: async (ctx, { watchTargetId, limit = 20 }) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return [];
    if (!(await canViewWatchTarget(ctx, watchTargetId))) return [];
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
    if (!(await canViewWatchTarget(ctx, watchTargetId))) return null;
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
    const visible = await getVisibleWatchTargetIds(ctx, userId);
    if (!scanRun.targetIds.every((tid) => visible.has(tid))) {
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
