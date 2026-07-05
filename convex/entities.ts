import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { canViewWatchTarget, getUserIdFromIdentity } from "./lib/auth";
import type { Id } from "./_generated/dataModel";


/** Flattened alias — Convex's esbuild bundler dislikes nested Id<"..."> inside Map<...>(). */
type EntityId = Id<"entities">;

const entityTypeV = v.union(
  v.literal("target"),
  v.literal("drug"),
  v.literal("company"),
  v.literal("indication"),
  v.literal("mechanism"),
  v.literal("person"),
  v.literal("trial"),
);
const edgeTypeV = v.union(
  v.literal("targets"),
  v.literal("targeted_by"),
  v.literal("developed_by"),
  v.literal("treats"),
  v.literal("tested_in"),
  v.literal("implicated_in"),
  v.literal("competes_with"),
  v.literal("analog_of"),
);
const evidenceV = v.array(
  v.object({
    source: v.string(),
    url: v.optional(v.string()),
    snippet: v.optional(v.string()),
    rawItemId: v.optional(v.id("rawItems")),
    score: v.optional(v.number()),
  }),
);
const entitySpecV = v.object({
  type: entityTypeV,
  canonicalName: v.string(),
  displayName: v.string(),
  aliases: v.array(v.string()),
  externalRefs: v.any(),
  refKey: v.string(),
  therapeuticArea: v.optional(
    v.union(v.literal("cardiovascular"), v.literal("oncology"), v.literal("other")),
  ),
  summary: v.optional(v.string()),
});
const edgeSpecV = v.object({
  fromKey: v.string(),
  toKey: v.string(),
  type: edgeTypeV,
  confidence: v.number(),
  evidence: evidenceV,
});
const graphV = v.object({
  central: entitySpecV,
  neighbors: v.object({ entities: v.array(entitySpecV), edges: v.array(edgeSpecV) }),
});

/**
 * Upsert the central entity + neighbor entities (dedup by refKey), edges (dedup by
 * from/to/type), and link the watch target to the central entity. Backbone entities are
 * global (shared). Neighborhood size is capped by `buildNeighborhood`.
 */
export const upsertFromBackbone = internalMutation({
  args: { watchTargetId: v.id("watchTargets"), graph: graphV },
  handler: async (ctx, { watchTargetId, graph }) => {
    const now = Date.now();
    const idByRef = new Map<string, EntityId>();

    const upsertEntity = async (
      spec: typeof graph.central,
      confidence: number,
    ): Promise<EntityId> => {
      const existing = await ctx.db
        .query("entities")
        .withIndex("by_refKey", (q) => q.eq("refKey", spec.refKey))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          aliases: Array.from(new Set([...existing.aliases, ...spec.aliases])),
          displayName: spec.displayName || existing.displayName,
          summary: spec.summary ?? existing.summary,
          externalRefs: { ...existing.externalRefs, ...spec.externalRefs },
          updatedAt: now,
        });
        return existing._id;
      }
      return await ctx.db.insert("entities", {
        type: spec.type,
        canonicalName: spec.canonicalName,
        displayName: spec.displayName,
        aliases: spec.aliases,
        refKey: spec.refKey,
        externalRefs: spec.externalRefs,
        therapeuticArea: spec.therapeuticArea,
        summary: spec.summary,
        global: true,
        confidence,
        origin: "backbone",
        createdAt: now,
        updatedAt: now,
      });
    };

    const centralId = await upsertEntity(graph.central, 1);
    idByRef.set(graph.central.refKey, centralId);
    for (const n of graph.neighbors.entities) {
      const id = await upsertEntity(n, 0.7);
      idByRef.set(n.refKey, id);
    }

    for (const e of graph.neighbors.edges) {
      const fromId = idByRef.get(e.fromKey);
      const toId = idByRef.get(e.toKey);
      if (!fromId || !toId) continue;
      const existing = await ctx.db
        .query("entityEdges")
        .withIndex("by_pair_type", (q) =>
          q.eq("fromId", fromId).eq("toId", toId).eq("type", e.type),
        )
        .first();
      if (existing) {
        const merged: typeof existing.evidence = [];
        const seenEv = new Set<string>();
        for (const ev of [...e.evidence, ...existing.evidence]) {
          const k = `${ev.source}|${ev.url ?? ""}`;
          if (seenEv.has(k)) continue;
          seenEv.add(k);
          merged.push(ev);
          if (merged.length >= 12) break;
        }
        await ctx.db.patch(existing._id, {
          confidence: Math.max(existing.confidence, e.confidence),
          evidence: merged,
          lastSeenAt: now,
        });
      } else {
        await ctx.db.insert("entityEdges", {
          fromId,
          toId,
          type: e.type,
          pending: false,
          evidence: e.evidence,
          confidence: e.confidence,
          origin: "backbone",
          global: true,
          firstSeenAt: now,
          lastSeenAt: now,
        });
      }
    }

    await ctx.db.patch(watchTargetId, { entityId: centralId });
    return {
      centralId,
      entityCount: 1 + graph.neighbors.entities.length,
      edgeCount: graph.neighbors.edges.length,
    };
  },
});

/** Return the central entity + its 1-hop neighbors (with edge type/confidence/evidence). */
export const getNeighborhood = query({
  args: { watchTargetId: v.id("watchTargets") },
  handler: async (ctx, { watchTargetId }) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId || !(await canViewWatchTarget(ctx, watchTargetId))) return null;
    const target = await ctx.db.get(watchTargetId);
    if (!target?.entityId) return null;
    const central = await ctx.db.get(target.entityId);
    if (!central) return null;

    const cid = central._id;
    type NeighborRow = {
      entity: {
        _id: Id<"entities">;
        type: string;
        displayName: string;
        canonicalName: string;
        aliases: string[];
      };
      edgeType: string;
      direction: "out" | "in";
      confidence: number;
      evidence: Array<{ source: string; url?: string; score?: number; snippet?: string }>;
    };
    const rows: NeighborRow[] = [];
    const seen = new Set<string>();
    const CAP = 40;

    const outEdges = await ctx.db
      .query("entityEdges")
      .withIndex("by_from_type", (q) => q.eq("fromId", cid))
      .take(80);
    const inEdges = await ctx.db
      .query("entityEdges")
      .withIndex("by_to", (q) => q.eq("toId", cid))
      .take(80);

    const push = async (
      edge: { _id: Id<"entityEdges">; type: string; confidence: number; evidence: any },
      neighborId: Id<"entities">,
      direction: "out" | "in",
    ) => {
      if (rows.length >= CAP) return;
      const key = `${edge._id}`;
      if (seen.has(key)) return;
      seen.add(key);
      const entity = await ctx.db.get(neighborId);
      if (!entity) return;
      rows.push({
        entity: {
          _id: entity._id,
          type: entity.type,
          displayName: entity.displayName,
          canonicalName: entity.canonicalName,
          aliases: entity.aliases,
        },
        edgeType: edge.type,
        direction,
        confidence: edge.confidence,
        evidence: (edge.evidence ?? []).map((ev: any) => ({
          source: ev.source,
          url: ev.url,
          score: ev.score,
          snippet: ev.snippet,
        })),
      });
    };

    for (const e of outEdges) await push(e, e.toId, "out");
    for (const e of inEdges) await push(e, e.fromId, "in");

    // 2-hop: companies developing the drugs that target this central (so "Developers" render).
    const seenEntity = new Set<string>(rows.map((r) => String(r.entity._id)));
    seenEntity.add(String(cid));
    for (const r of [...rows]) {
      if (rows.length >= CAP) break;
      if (r.entity.type !== "drug") continue;
      const devEdges = await ctx.db
        .query("entityEdges")
        .withIndex("by_from_type", (q) =>
          q.eq("fromId", r.entity._id).eq("type", "developed_by"),
        )
        .take(5);
      for (const de of devEdges) {
        if (rows.length >= CAP) break;
        const key = String(de.toId);
        if (seenEntity.has(key)) continue;
        seenEntity.add(key);
        const company = await ctx.db.get(de.toId);
        if (!company) continue;
        rows.push({
          entity: {
            _id: company._id,
            type: company.type,
            displayName: company.displayName,
            canonicalName: company.canonicalName,
            aliases: company.aliases,
          },
          edgeType: "developed_by",
          direction: "out",
          confidence: de.confidence,
          evidence: (de.evidence ?? []).map((ev: any) => ({
            source: ev.source,
            url: ev.url,
            score: ev.score,
            snippet: ev.snippet,
          })),
        });
      }
    }

    return {
      central: {
        _id: central._id,
        type: central.type,
        displayName: central.displayName,
        canonicalName: central.canonicalName,
        aliases: central.aliases,
        summary: central.summary,
      },
      neighbors: rows,
    };
  },
});
