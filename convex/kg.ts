"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { buildNeighborhood } from "../lib/kg/ingest";

/**
 * Resolve a watch target to its KG entity and ingest the backbone neighborhood.
 * Scheduled from `watchTargets.create`. Best-effort (R-KG-5): errors are logged and
 * never fail target creation.
 */
export const ingestNeighborhood = internalAction({
  args: { watchTargetId: v.id("watchTargets") },
  handler: async (ctx, { watchTargetId }) => {
    try {
      const [target] = await ctx.runQuery(internal.watchTargets.getByIdsInternal, {
        ids: [watchTargetId],
      });
      if (!target) return { ok: false, reason: "not_found" as const };
      const graph = await buildNeighborhood({
        name: target.name,
        displayName: target.displayName,
        type: target.type,
        company: target.company,
        indication: target.indication,
        aliases: target.aliases,
        therapeuticArea: target.therapeuticArea,
      });
      await ctx.runMutation(internal.entities.upsertFromBackbone, { watchTargetId, graph });
      return {
        ok: true as const,
        entityCount: 1 + graph.neighbors.entities.length,
        edgeCount: graph.neighbors.edges.length,
      };
    } catch (e) {
      console.error(
        `[kg.ingestNeighborhood] ${watchTargetId}:`,
        e instanceof Error ? e.message : String(e),
      );
      return { ok: false as const, reason: "error" as const };
    }
  },
});
