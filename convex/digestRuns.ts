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

function checkScanSecret(secret: string): boolean {
  const expected = process.env.SCAN_SECRET;
  return (
    typeof expected === "string" &&
    expected.length > 0 &&
    secret === expected
  );
}

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

/** Server-only: load a digest run by id (decision-digest backfill). */
const decisionConfidenceValidator = v.union(v.literal("low"), v.literal("medium"), v.literal("high"));

export const getDigestRunByIdForServer = query({
  args: { secret: v.string(), id: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("digestRuns"),
      scanRunId: v.id("scanRuns"),
      generatedAt: v.number(),
      period: v.union(v.literal("daily"), v.literal("weekly")),
      executiveSummary: v.string(),
      deltaSummary: v.optional(v.string()),
      materialitySummary: v.optional(v.string()),
      recommendedActionsSummary: v.optional(v.string()),
      strategicReadSummary: v.optional(v.string()),
      confidence: v.optional(decisionConfidenceValidator),
    }),
  ),
  handler: async (ctx, { secret, id }) => {
    if (!checkScanSecret(secret)) return null;
    const run = await ctx.db.get(id as Id<"digestRuns">);
    if (!run) return null;
    const c = run.confidence;
    const confidence =
      c === "low" || c === "medium" || c === "high" ? c : undefined;
    return {
      _id: run._id,
      scanRunId: run.scanRunId,
      generatedAt: run.generatedAt,
      period: run.period,
      executiveSummary: run.executiveSummary,
      deltaSummary: typeof run.deltaSummary === "string" ? run.deltaSummary : undefined,
      materialitySummary:
        typeof run.materialitySummary === "string" ? run.materialitySummary : undefined,
      recommendedActionsSummary:
        typeof run.recommendedActionsSummary === "string"
          ? run.recommendedActionsSummary
          : undefined,
      strategicReadSummary:
        typeof run.strategicReadSummary === "string" ? run.strategicReadSummary : undefined,
      confidence,
    };
  },
});

const priorDecisionContextRowValidator = v.object({
  generatedAt: v.number(),
  executiveSummary: v.string(),
  deltaSummary: v.optional(v.string()),
  materialitySummary: v.optional(v.string()),
  recommendedActionsSummary: v.optional(v.string()),
  strategicReadSummary: v.optional(v.string()),
  signalsCompact: v.array(
    v.object({
      headline: v.string(),
      synthesis: v.string(),
    }),
  ),
});

/**
 * Server-only: prior digest runs with the same watch-target scope as the current digest or scan,
 * for decision-brief generation (prior executive summary, prior brief fields, compact signal lines).
 * Pass exactly one of `digestRunId` (backfill: runs older than this digest) or `scanRunId` (new digest after scan).
 */
export const listPriorDecisionContextFromServer = query({
  args: {
    secret: v.string(),
    limit: v.optional(v.number()),
    digestRunId: v.optional(v.id("digestRuns")),
    scanRunId: v.optional(v.id("scanRuns")),
  },
  returns: v.array(priorDecisionContextRowValidator),
  handler: async (ctx, args) => {
    if (!checkScanSecret(args.secret)) return [];
    const dig = args.digestRunId;
    const scanRef = args.scanRunId;
    if ((dig != null) === (scanRef != null)) return [];

    const lim = Math.min(Math.max(1, args.limit ?? 8), 20);

    const truncate = (s: string, max: number) => {
      const t = s.trim();
      if (t.length <= max) return t;
      return `${t.slice(0, max - 1)}…`;
    };

    const sortTargetKey = (ids: readonly Id<"watchTargets">[] | undefined) => {
      if (!ids?.length) return null as string | null;
      return [...new Set(ids.map(String))].sort().join(",");
    };

    async function targetKeyForDigestRun(did: Id<"digestRuns">): Promise<string | null> {
      const run = await ctx.db.get(did);
      if (!run) return null;
      const scan = await ctx.db.get(run.scanRunId);
      const k = sortTargetKey(scan?.targetIds);
      if (k) return k;
      const digestItems = await ctx.db
        .query("digestItems")
        .withIndex("by_digestRun", (q) => q.eq("digestRunId", did))
        .take(400);
      const tids = [...new Set(digestItems.map((i) => i.watchTargetId))];
      return sortTargetKey(tids);
    }

    let key: string | null = null;
    let cutoffTime: number | null = null;

    if (dig) {
      const current = await ctx.db.get(dig);
      if (!current) return [];
      cutoffTime = current.generatedAt;
      key = await targetKeyForDigestRun(dig);
    } else if (scanRef) {
      const scan = await ctx.db.get(scanRef);
      key = sortTargetKey(scan?.targetIds);
    }
    if (!key) return [];

    const scanCap = 800;
    const all = await ctx.db
      .query("digestRuns")
      .withIndex("by_generatedAt")
      .order("desc")
      .take(scanCap);

    const out: Array<{
      generatedAt: number;
      executiveSummary: string;
      deltaSummary?: string;
      materialitySummary?: string;
      recommendedActionsSummary?: string;
      strategicReadSummary?: string;
      signalsCompact: Array<{ headline: string; synthesis: string }>;
    }> = [];

    for (const r of all) {
      if (dig && r._id === dig) continue;
      if (cutoffTime != null && r.generatedAt >= cutoffTime) continue;
      if (scanRef && r.scanRunId === scanRef) continue;

      const rk = await targetKeyForDigestRun(r._id);
      if (rk !== key) continue;

      const rowItems = await ctx.db
        .query("digestItems")
        .withIndex("by_digestRun", (q) => q.eq("digestRunId", r._id))
        .take(25);

      out.push({
        generatedAt: r.generatedAt,
        executiveSummary: truncate(r.executiveSummary, 700),
        deltaSummary: r.deltaSummary ? truncate(r.deltaSummary, 550) : undefined,
        materialitySummary: r.materialitySummary ? truncate(r.materialitySummary, 550) : undefined,
        recommendedActionsSummary: r.recommendedActionsSummary
          ? truncate(r.recommendedActionsSummary, 450)
          : undefined,
        strategicReadSummary: r.strategicReadSummary
          ? truncate(r.strategicReadSummary, 650)
          : undefined,
        signalsCompact: rowItems.slice(0, 14).map((it) => ({
          headline: truncate(it.headline, 220),
          synthesis: truncate(it.synthesis, 320),
        })),
      });

      if (out.length >= lim) break;
    }

    return out;
  },
});

/**
 * Server-only: newest-first digest run ids that lack a stored decision brief
 * (no delta/materiality/actions text and no confidence).
 */
export const listDigestRunIdsMissingDecisionFromServer = query({
  args: { secret: v.string(), limit: v.optional(v.number()) },
  returns: v.array(v.id("digestRuns")),
  handler: async (ctx, { secret, limit = 100 }) => {
    if (!checkScanSecret(secret)) return [];
    const cap = Math.min(Math.max(1, limit), 500);
    const scanCap = Math.min(5000, cap * 25);
    const all = await ctx.db
      .query("digestRuns")
      .withIndex("by_generatedAt")
      .order("desc")
      .take(scanCap);
    const out: Id<"digestRuns">[] = [];
    for (const r of all) {
      const hasDecision =
        (typeof r.deltaSummary === "string" && r.deltaSummary.trim() !== "") ||
        (typeof r.materialitySummary === "string" && r.materialitySummary.trim() !== "") ||
        (typeof r.recommendedActionsSummary === "string" &&
          r.recommendedActionsSummary.trim() !== "") ||
        (typeof r.strategicReadSummary === "string" && r.strategicReadSummary.trim() !== "") ||
        r.confidence != null;
      if (!hasDecision) out.push(r._id);
      if (out.length >= cap) break;
    }
    return out;
  },
});

/** Server-only: newest digest run ids (cap for admin backfill / re-run with --force). */
export const listDigestRunIdsNewestFromServer = query({
  args: { secret: v.string(), limit: v.optional(v.number()) },
  returns: v.array(v.id("digestRuns")),
  handler: async (ctx, { secret, limit = 100 }) => {
    if (!checkScanSecret(secret)) return [];
    const cap = Math.min(Math.max(1, limit ?? 100), 500);
    const all = await ctx.db
      .query("digestRuns")
      .withIndex("by_generatedAt")
      .order("desc")
      .take(cap);
    return all.map((r) => r._id);
  },
});

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
      const comments = await ctx.db
        .query("digestItemComments")
        .withIndex("by_digestItem", (q) => q.eq("digestItemId", item._id))
        .collect();
      for (const c of comments) {
        await ctx.db.delete(c._id);
      }
      await ctx.db.delete(item._id);
    }
    await ctx.db.delete(id);
    return { deleted: true };
  },
});
