import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { ALL_SOURCE_IDS, SOURCES_TOTAL } from "./lib/sourceIds";
import { getOrCreateUserId, getUserIdFromIdentity } from "./lib/auth";

function checkScanSecret(secret: string): boolean {
  return typeof process.env.SCAN_SECRET === "string" && process.env.SCAN_SECRET.length > 0 && secret === process.env.SCAN_SECRET;
}

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
    const limit = args.limit ?? 10;
    const all = await ctx.db
      .query("scanRuns")
      .withIndex("by_scheduledFor")
      .order("desc")
      .take(limit * 3);
    const filtered = all.filter(
      (run) =>
        run.targetIds &&
        run.targetIds.length > 0 &&
        run.targetIds.every((id) => userTargetIdSet.has(id)),
    );
    return filtered.slice(0, limit);
  },
});

export const createRun = mutation({
  args: { period: v.union(v.literal("daily"), v.literal("weekly")) },
  handler: async (ctx, { period }) => {
    return await ctx.db.insert("scanRuns", {
      scheduledFor: Date.now(),
      status: "pending",
      period,
      sourcesTotal: SOURCES_TOTAL,
      sourcesCompleted: 0,
      totalItemsFound: 0,
      newItemsFound: 0,
    });
  },
});

export const createRunForServer = mutation({
  args: {
    secret: v.string(),
    period: v.union(v.literal("daily"), v.literal("weekly")),
    targetIds: v.optional(v.array(v.id("watchTargets"))),
    sourceIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { secret, period, targetIds, sourceIds }) => {
    if (!checkScanSecret(secret)) throw new Error("Unauthorized");
    const sourcesToRun =
      sourceIds?.length &&
      sourceIds.every((s) => (ALL_SOURCE_IDS as readonly string[]).includes(s))
        ? sourceIds
        : [...ALL_SOURCE_IDS];
    const sourcesTotal = sourcesToRun.length;
    const scanRunId = await ctx.db.insert("scanRuns", {
      scheduledFor: Date.now(),
      status: "pending",
      period,
      sourcesTotal,
      sourcesCompleted: 0,
      totalItemsFound: 0,
      newItemsFound: 0,
      targetIds: targetIds,
    });
    for (const source of sourcesToRun) {
      await ctx.db.insert("scanSourceStatus", {
        scanRunId,
        source,
        status: "pending",
        itemsFound: 0,
      });
    }
    return scanRunId;
  },
});

export const updateScanStatusFromServer = mutation({
  args: {
    secret: v.string(),
    scanRunId: v.id("scanRuns"),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("completed"), v.literal("failed")),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    sourcesCompleted: v.optional(v.number()),
    totalItemsFound: v.optional(v.number()),
    newItemsFound: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!checkScanSecret(args.secret)) return;
    const { secret: _, scanRunId, ...updates } = args;
    const doc = await ctx.db.get(scanRunId);
    if (!doc) return;
    await ctx.db.patch(scanRunId, updates);
  },
});

export const updateSourceStatusFromServer = mutation({
  args: {
    secret: v.string(),
    scanRunId: v.id("scanRuns"),
    source: v.string(),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("completed"), v.literal("failed"), v.literal("skipped")),
    itemsFound: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!checkScanSecret(args.secret)) return;
    const { secret: _s, ...rest } = args;
    const statuses = await ctx.db
      .query("scanSourceStatus")
      .withIndex("by_scanRun", (q) => q.eq("scanRunId", rest.scanRunId))
      .collect();
    const row = statuses.find((s) => s.source === rest.source);
    if (!row) return;
    await ctx.db.patch(row._id, {
      status: rest.status,
      ...(rest.itemsFound !== undefined && { itemsFound: rest.itemsFound }),
      ...(rest.startedAt !== undefined && { startedAt: rest.startedAt }),
      ...(rest.completedAt !== undefined && { completedAt: rest.completedAt }),
      ...(rest.error !== undefined && { error: rest.error }),
    });
  },
});

/** Internal: get scan run by id (no auth). Used by digest pipeline and cron. */
export const getScanRun = internalQuery({
  args: { id: v.id("scanRuns") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const get = query({
  args: {
    id: v.id("scanRuns"),
    /** Server-only: when provided and valid, skips user ownership check (for scan pipeline). */
    secret: v.optional(v.string()),
  },
  handler: async (ctx, { id, secret }) => {
    const run = await ctx.db.get(id);
    if (!run) return null;
    if (secret != null && checkScanSecret(secret)) return run;
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return null;
    if (!run.targetIds?.length) return null;
    const userTargets = await ctx.db
      .query("watchTargets")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const userSet = new Set(userTargets.map((t) => t._id));
    return run.targetIds.every((tid) => userSet.has(tid)) ? run : null;
  },
});

export const getSourceStatuses = query({
  args: { scanRunId: v.id("scanRuns") },
  handler: async (ctx, { scanRunId }) => {
    const run = await ctx.db.get(scanRunId);
    if (!run) return [];
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return [];
    if (run.targetIds?.length) {
      const userTargets = await ctx.db
        .query("watchTargets")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect();
      const userSet = new Set(userTargets.map((t) => t._id));
      if (!run.targetIds.every((id) => userSet.has(id))) return [];
    }
    return await ctx.db
      .query("scanSourceStatus")
      .withIndex("by_scanRun", (q) => q.eq("scanRunId", scanRunId))
      .collect();
  },
});

export const scheduleScan = internalMutation({
  args: {
    period: v.union(v.literal("daily"), v.literal("weekly")),
    targetIds: v.optional(v.array(v.id("watchTargets"))),
  },
  handler: async (ctx, args) => {
    const scanRunId = await ctx.db.insert("scanRuns", {
      scheduledFor: Date.now(),
      status: "pending",
      period: args.period,
      sourcesTotal: SOURCES_TOTAL,
      sourcesCompleted: 0,
      totalItemsFound: 0,
      newItemsFound: 0,
      targetIds: args.targetIds,
    });
    for (const source of ALL_SOURCE_IDS) {
      await ctx.db.insert("scanSourceStatus", {
        scanRunId,
        source,
        status: "pending",
        itemsFound: 0,
      });
    }
    await ctx.scheduler.runAfter(0, internal.scans.callScanApi, {
      scanRunId,
      period: args.period,
      targetIds: args.targetIds,
    });
    return scanRunId;
  },
});

export const runScan = mutation({
  args: {
    period: v.union(v.literal("daily"), v.literal("weekly")),
    targetIds: v.optional(v.array(v.id("watchTargets"))),
  },
  handler: async (ctx, args) => {
    const userId = await getOrCreateUserId(ctx);
    const userTargets = await ctx.db
      .query("watchTargets")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const userTargetIdSet = new Set(userTargets.map((t) => t._id));
    const targetIds =
      args.targetIds?.filter((id) => userTargetIdSet.has(id)) ??
      userTargets.map((t) => t._id);
    const scanRunId = await ctx.db.insert("scanRuns", {
      scheduledFor: Date.now(),
      status: "pending",
      period: args.period,
      sourcesTotal: SOURCES_TOTAL,
      sourcesCompleted: 0,
      totalItemsFound: 0,
      newItemsFound: 0,
      targetIds: targetIds.length > 0 ? targetIds : undefined,
    });
    for (const source of ALL_SOURCE_IDS) {
      await ctx.db.insert("scanSourceStatus", {
        scanRunId,
        source,
        status: "pending",
        itemsFound: 0,
      });
    }
    await ctx.scheduler.runAfter(0, internal.scans.callScanApi, {
      scanRunId,
      period: args.period,
      targetIds: targetIds.length > 0 ? targetIds : undefined,
    });
    return scanRunId;
  },
});

export const updateScanStatus = internalMutation({
  args: {
    scanRunId: v.id("scanRuns"),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("completed"), v.literal("failed")),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    sourcesCompleted: v.optional(v.number()),
    totalItemsFound: v.optional(v.number()),
    newItemsFound: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { scanRunId, ...updates } = args;
    const doc = await ctx.db.get(scanRunId);
    if (!doc) return;
    await ctx.db.patch(scanRunId, updates);
  },
});

export const updateSourceStatus = internalMutation({
  args: {
    scanRunId: v.id("scanRuns"),
    source: v.string(),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("completed"), v.literal("failed"), v.literal("skipped")),
    itemsFound: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const statuses = await ctx.db
      .query("scanSourceStatus")
      .withIndex("by_scanRun", (q) => q.eq("scanRunId", args.scanRunId))
      .collect();
    const row = statuses.find((s) => s.source === args.source);
    if (!row) return;
    await ctx.db.patch(row._id, {
      status: args.status,
      ...(args.itemsFound !== undefined && { itemsFound: args.itemsFound }),
      ...(args.startedAt !== undefined && { startedAt: args.startedAt }),
      ...(args.completedAt !== undefined && { completedAt: args.completedAt }),
      ...(args.error !== undefined && { error: args.error }),
    });
  },
});

const APP_URL = process.env.APP_URL ?? "";
const SCAN_SECRET = process.env.SCAN_SECRET ?? "";

export const callScanApi = internalAction({
  args: {
    scanRunId: v.id("scanRuns"),
    period: v.union(v.literal("daily"), v.literal("weekly")),
    targetIds: v.optional(v.array(v.id("watchTargets"))),
  },
  handler: async (ctx, { scanRunId, period, targetIds }) => {
    if (!APP_URL || !SCAN_SECRET) {
      console.error("callScanApi: APP_URL or SCAN_SECRET not set in Convex env");
      return;
    }
    const url = `${APP_URL.replace(/\/$/, "")}/api/scan`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SCAN_SECRET}`,
      },
      body: JSON.stringify({ scanRunId, period, targetIds }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("callScanApi failed:", res.status, text);
    }
  },
});

export const clearAllScanData = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    if (!checkScanSecret(secret)) throw new Error("Unauthorized");
    const digestItems = await ctx.db.query("digestItems").collect();
    for (const d of digestItems) await ctx.db.delete(d._id);
    const digestRuns = await ctx.db.query("digestRuns").collect();
    for (const d of digestRuns) await ctx.db.delete(d._id);
    const rawItems = await ctx.db.query("rawItems").collect();
    for (const r of rawItems) await ctx.db.delete(r._id);
    const sourceStatuses = await ctx.db.query("scanSourceStatus").collect();
    for (const s of sourceStatuses) await ctx.db.delete(s._id);
    const runs = await ctx.db.query("scanRuns").collect();
    for (const r of runs) await ctx.db.delete(r._id);
    return { deleted: { digestItems: digestItems.length, digestRuns: digestRuns.length, rawItems: rawItems.length, scanSourceStatus: sourceStatuses.length, scanRuns: runs.length } };
  },
});
