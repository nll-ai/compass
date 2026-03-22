import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { ALL_SOURCE_IDS, SOURCES_TOTAL } from "./lib/sourceIds";
import { getOrCreateUserId, getUserIdFromIdentity, getVisibleWatchTargetIds } from "./lib/auth";

function checkScanSecret(secret: string): boolean {
  return typeof process.env.SCAN_SECRET === "string" && process.env.SCAN_SECRET.length > 0 && secret === process.env.SCAN_SECRET;
}

/** Above Next.js `maxDuration` (300s) with margin for slow final writes. */
const STALE_RUNNING_SCAN_MS = 30 * 60 * 1000;
/** Pending run never picked up by `/api/scan` (e.g. bridge misconfiguration). */
const STALE_PENDING_SCAN_MS = 60 * 60 * 1000;

async function failScanRunWithSources(
  ctx: MutationCtx,
  scanRunId: Id<"scanRuns">,
  errorMessage: string,
  now: number,
): Promise<boolean> {
  const run = await ctx.db.get(scanRunId);
  if (!run) return false;
  if (run.status !== "pending" && run.status !== "running") return false;
  const err = errorMessage.slice(0, 2000);
  await ctx.db.patch(scanRunId, {
    status: "failed",
    completedAt: now,
    error: err,
  });
  const rows = await ctx.db
    .query("scanSourceStatus")
    .withIndex("by_scanRun", (q) => q.eq("scanRunId", scanRunId))
    .collect();
  const sourceErr = errorMessage.slice(0, 500);
  for (const row of rows) {
    if (row.status === "pending" || row.status === "running") {
      await ctx.db.patch(row._id, {
        status: "failed",
        completedAt: now,
        error: sourceErr,
      });
    }
  }
  return true;
}

/** List scan runs that are pending or running, scoped to the current user's targets. */
export const listRunning = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return [];
    const visible = await getVisibleWatchTargetIds(ctx, userId);
    const pending = await ctx.db
      .query("scanRuns")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const running = await ctx.db
      .query("scanRuns")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();
    const merged = [...pending, ...running];
    const filtered = merged.filter(
      (run) =>
        run.targetIds &&
        run.targetIds.length > 0 &&
        run.targetIds.every((id) => visible.has(id)),
    );
    filtered.sort((a, b) => b.scheduledFor - a.scheduledFor);
    return filtered;
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return [];
    const visible = await getVisibleWatchTargetIds(ctx, userId);
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
        run.targetIds.every((id) => visible.has(id)),
    );
    return filtered.slice(0, limit);
  },
});

/** Completed or failed scan runs for visible targets, newest by completion time first. Includes digest id when a digest was generated for that run. */
export const listScanHistory = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return [];
    const visible = await getVisibleWatchTargetIds(ctx, userId);
    const limit = Math.min(args.limit ?? 30, 100);
    const maxFetch = 500;
    const all = await ctx.db
      .query("scanRuns")
      .withIndex("by_scheduledFor")
      .order("desc")
      .take(maxFetch);
    const terminal = all.filter(
      (run) =>
        run.targetIds &&
        run.targetIds.length > 0 &&
        run.targetIds.every((id) => visible.has(id)) &&
        (run.status === "completed" || run.status === "failed"),
    );
    const sortKey = (r: Doc<"scanRuns">) => r.completedAt ?? r.startedAt ?? r.scheduledFor;
    terminal.sort((a, b) => sortKey(b) - sortKey(a));
    const slice = terminal.slice(0, limit);
    // Return a flat shape per row (scan run fields + digestRunId). Nested { run } objects
    // have caused serialization/runtime errors in Convex for some deployments.
    return await Promise.all(
      slice.map(async (run) => {
        const digest = await ctx.db
          .query("digestRuns")
          .withIndex("by_scanRun", (q) => q.eq("scanRunId", run._id))
          .first();
        return { ...run, digestRunId: digest?._id ?? null };
      }),
    );
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
    if (updates.status === "completed" && doc.targetIds != null && doc.targetIds.length > 0) {
      await ctx.scheduler.runAfter(0, internal.crossTargetGraph.reconcileForWatchTargets, {
        watchTargetIds: doc.targetIds,
      });
    }
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

export const markScanRunFailedFromServer = mutation({
  args: {
    secret: v.string(),
    scanRunId: v.id("scanRuns"),
    error: v.string(),
  },
  handler: async (ctx, { secret, scanRunId, error }) => {
    if (!checkScanSecret(secret)) return;
    await failScanRunWithSources(ctx, scanRunId, error, Date.now());
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
    const visible = await getVisibleWatchTargetIds(ctx, userId);
    return run.targetIds.every((tid) => visible.has(tid)) ? run : null;
  },
});

export const getSourceStatuses = query({
  args: { scanRunId: v.id("scanRuns") },
  handler: async (ctx, { scanRunId }) => {
    const run = await ctx.db.get(scanRunId);
    if (!run) return [];
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return [];
    // Align with scans.get / listRunning: runs without targetIds are not visible to clients.
    if (!run.targetIds?.length) return [];
    const visible = await getVisibleWatchTargetIds(ctx, userId);
    if (!run.targetIds.every((id) => visible.has(id))) return [];
    return await ctx.db
      .query("scanSourceStatus")
      .withIndex("by_scanRun", (q) => q.eq("scanRunId", scanRunId))
      .collect();
  },
});

export const dismissStuckScanRun = mutation({
  args: { scanRunId: v.id("scanRuns") },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({ ok: v.literal(false), reason: v.literal("already_finished") }),
  ),
  handler: async (ctx, { scanRunId }) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) {
      throw new ConvexError("Sign in required to dismiss a scan.");
    }
    const run = await ctx.db.get(scanRunId);
    if (!run?.targetIds?.length) {
      throw new ConvexError("Scan not found.");
    }
    const visible = await getVisibleWatchTargetIds(ctx, userId);
    if (!run.targetIds.every((id) => visible.has(id))) {
      throw new ConvexError("Scan not found.");
    }
    let ok: boolean;
    try {
      ok = await failScanRunWithSources(ctx, scanRunId, "Dismissed from Watch Targets.", Date.now());
    } catch (cause) {
      console.error("dismissStuckScanRun: failScanRunWithSources", cause);
      throw new ConvexError(
        "Could not dismiss this scan. Try again in a moment, or wait for the list to refresh.",
      );
    }
    if (!ok) {
      return { ok: false as const, reason: "already_finished" as const };
    }
    return { ok: true as const };
  },
});

export const scheduleScan = internalMutation({
  args: {
    period: v.union(v.literal("daily"), v.literal("weekly")),
    targetIds: v.optional(v.array(v.id("watchTargets"))),
    digestNotifyUserIds: v.optional(v.array(v.id("users"))),
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
      digestNotifyUserIds: args.digestNotifyUserIds,
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
    const visible = await getVisibleWatchTargetIds(ctx, userId);
    const subs = await ctx.db
      .query("targetSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const subSet = new Set(subs.map((s) => s.watchTargetId));

    async function canScan(tid: Id<"watchTargets">): Promise<boolean> {
      if (!visible.has(tid)) return false;
      const t = await ctx.db.get(tid);
      if (!t?.active) return false;
      if (t.userId === userId) return true;
      return subSet.has(tid);
    }

    let targetIds: Id<"watchTargets">[] = [];
    if (args.targetIds?.length) {
      for (const id of args.targetIds) {
        if (await canScan(id)) targetIds.push(id);
      }
    } else {
      for (const id of visible) {
        if (await canScan(id)) targetIds.push(id);
      }
    }
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

export const reconcileStaleScanRuns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let reconciled = 0;
    const pending = await ctx.db
      .query("scanRuns")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const running = await ctx.db
      .query("scanRuns")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();
    for (const run of pending) {
      if (now - run.scheduledFor > STALE_PENDING_SCAN_MS) {
        const did = await failScanRunWithSources(
          ctx,
          run._id,
          "Scan was never started or the pipeline did not report completion.",
          now,
        );
        if (did) reconciled += 1;
      }
    }
    for (const run of running) {
      const t0 = run.startedAt ?? run.scheduledFor;
      if (now - t0 > STALE_RUNNING_SCAN_MS) {
        const did = await failScanRunWithSources(
          ctx,
          run._id,
          "Scan timed out or was interrupted before completion.",
          now,
        );
        if (did) reconciled += 1;
      }
    }
    return { reconciled };
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
