import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  linkKeyForRawItem,
  mergeRawItemIds,
  orderedTargetPair,
  scopeKeyForWatchTarget,
} from "./lib/crossTargetLinks";
import { getUserIdFromIdentity, getVisibleWatchTargetIds } from "./lib/auth";

export const reconcileForWatchTargets = internalMutation({
  args: { watchTargetIds: v.array(v.id("watchTargets")) },
  handler: async (ctx, { watchTargetIds }) => {
    if (watchTargetIds.length === 0) return { edgesUpserted: 0 };
    const seed = new Set(watchTargetIds);
    const processedLinkKeys = new Set<string>();
    let edgesUpserted = 0;
    const now = Date.now();

    for (const tid of watchTargetIds) {
      const items = await ctx.db
        .query("rawItems")
        .withIndex("by_watchTarget", (q) => q.eq("watchTargetId", tid))
        .collect();

      for (const item of items) {
        const linkKey = linkKeyForRawItem(item);
        if (processedLinkKeys.has(linkKey)) continue;
        processedLinkKeys.add(linkKey);

        const siblings = await ctx.db
          .query("rawItems")
          .withIndex("by_externalId", (q) =>
            q.eq("source", item.source).eq("externalId", item.externalId),
          )
          .collect();

        const byTarget = new Map<Id<"watchTargets">, Id<"rawItems">[]>();
        for (const s of siblings) {
          const list = byTarget.get(s.watchTargetId) ?? [];
          list.push(s._id);
          byTarget.set(s.watchTargetId, list);
        }

        if (byTarget.size < 2) continue;

        const targetIds = [...byTarget.keys()];
        for (let i = 0; i < targetIds.length; i++) {
          for (let j = i + 1; j < targetIds.length; j++) {
            const t1 = targetIds[i]!;
            const t2 = targetIds[j]!;
            if (!seed.has(t1) && !seed.has(t2)) continue;

            const doc1 = await ctx.db.get(t1);
            const doc2 = await ctx.db.get(t2);
            if (!doc1 || !doc2) continue;
            const sk1 = scopeKeyForWatchTarget(doc1);
            const sk2 = scopeKeyForWatchTarget(doc2);
            if (sk1 == null || sk1 !== sk2) continue;

            const [idA, idB] = orderedTargetPair(t1, t2);
            const rawIds = [...(byTarget.get(t1) ?? []), ...(byTarget.get(t2) ?? [])];

            const existing = await ctx.db
              .query("graphCrossTargetEdges")
              .withIndex("by_scope_targets_key", (q) =>
                q
                  .eq("scopeKey", sk1)
                  .eq("watchTargetIdA", idA)
                  .eq("watchTargetIdB", idB)
                  .eq("linkKey", linkKey),
              )
              .first();

            if (existing) {
              const merged = mergeRawItemIds(existing.rawItemIds, rawIds);
              await ctx.db.patch(existing._id, { rawItemIds: merged, lastSeenAt: now });
            } else {
              await ctx.db.insert("graphCrossTargetEdges", {
                scopeKey: sk1,
                watchTargetIdA: idA,
                watchTargetIdB: idB,
                linkKind: "shared_external_id",
                linkKey,
                rawItemIds: mergeRawItemIds([], rawIds),
                lastSeenAt: now,
              });
            }
            edgesUpserted++;
          }
        }
      }
    }

    return { edgesUpserted };
  },
});

/** Schedules reconciliation for all watch targets visible to the signed-in user (historical backfill). */
export const scheduleReconcileForMyVisibleTargets = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) throw new Error("Unauthorized");
    const visible = await getVisibleWatchTargetIds(ctx, userId);
    const ids = [...visible];
    if (ids.length < 2) return { scheduled: false as const };
    await ctx.scheduler.runAfter(0, internal.crossTargetGraph.reconcileForWatchTargets, {
      watchTargetIds: ids,
    });
    return { scheduled: true as const, targetCount: ids.length };
  },
});

type GraphEdgeDoc = Doc<"graphCrossTargetEdges">;

export const listEdgesForViewer = query({
  args: { watchTargetId: v.optional(v.id("watchTargets")) },
  handler: async (ctx, { watchTargetId }) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return [];
    const visible = await getVisibleWatchTargetIds(ctx, userId);
    if (visible.size < 2) return [];

    const idsToScan =
      watchTargetId != null
        ? visible.has(watchTargetId)
          ? [watchTargetId]
          : []
        : [...visible];

    const edgeMap = new Map<Id<"graphCrossTargetEdges">, GraphEdgeDoc>();

    for (const tid of idsToScan) {
      const asA = await ctx.db
        .query("graphCrossTargetEdges")
        .withIndex("by_watchTargetA", (q) => q.eq("watchTargetIdA", tid))
        .collect();
      for (const e of asA) {
        if (!visible.has(e.watchTargetIdB)) continue;
        if (watchTargetId != null && e.watchTargetIdB !== watchTargetId && e.watchTargetIdA !== watchTargetId) {
          continue;
        }
        edgeMap.set(e._id, e);
      }
      const asB = await ctx.db
        .query("graphCrossTargetEdges")
        .withIndex("by_watchTargetB", (q) => q.eq("watchTargetIdB", tid))
        .collect();
      for (const e of asB) {
        if (!visible.has(e.watchTargetIdA)) continue;
        if (watchTargetId != null && e.watchTargetIdA !== watchTargetId && e.watchTargetIdB !== watchTargetId) {
          continue;
        }
        edgeMap.set(e._id, e);
      }
    }

    const edges = [...edgeMap.values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt);

    const out = [];
    for (const e of edges) {
      const ta = await ctx.db.get(e.watchTargetIdA);
      const tb = await ctx.db.get(e.watchTargetIdB);
      if (!ta || !tb) continue;
      out.push({
        _id: e._id,
        linkKey: e.linkKey,
        linkKind: e.linkKind,
        lastSeenAt: e.lastSeenAt,
        watchTargetIdA: e.watchTargetIdA,
        watchTargetIdB: e.watchTargetIdB,
        displayNameA: ta.displayName,
        displayNameB: tb.displayName,
        rawItemIds: e.rawItemIds,
      });
    }
    return out;
  },
});
