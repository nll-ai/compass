import { v } from "convex/values";
import { internalAction, internalMutation, mutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { formatSourceDate } from "./lib/formatters";

const categoryValidator = v.union(
  v.literal("trial_update"),
  v.literal("publication"),
  v.literal("regulatory"),
  v.literal("filing"),
  v.literal("news"),
  v.literal("conference"),
);
const significanceValidator = v.union(
  v.literal("critical"),
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
);

function checkDigestSecret(secret: string): boolean {
  return typeof process.env.SCAN_SECRET === "string" && process.env.SCAN_SECRET.length > 0 && secret === process.env.SCAN_SECRET;
}

function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function synthesisEquivalentToHeadline(headline: string, synthesis: string): boolean {
  const h = normalizeForCompare(headline);
  const t = normalizeForCompare(synthesis);
  if (h === t) return true;
  if (h.length < 10 || t.length < 10) return false;
  const hWords = new Set(h.split(/\s+/).filter(Boolean));
  const tWords = new Set(t.split(/\s+/).filter(Boolean));
  const overlap = [...hWords].filter((w) => tWords.has(w)).length;
  const unionSize = new Set([...hWords, ...tWords]).size;
  if (unionSize === 0) return false;
  const jaccard = overlap / unionSize;
  if (jaccard >= 0.85) return true;
  const shorter = h.length <= t.length ? h : t;
  const longer = h.length <= t.length ? t : h;
  if (longer.includes(shorter) && longer.length - shorter.length < 50) return true;
  return false;
}

/** Infer category from raw item source. One summary per source. */
function categoryForSource(source: string): "trial_update" | "publication" | "regulatory" | "filing" | "news" | "conference" {
  const m: Record<string, "trial_update" | "publication" | "regulatory" | "filing" | "news" | "conference"> = {
    edgar: "filing",
    pubmed: "publication",
    clinicaltrials: "trial_update",
    exa: "news",
    openfda: "regulatory",
    rss: "news",
    patents: "publication",
  };
  return m[source] ?? "news";
}

export const createDigestRunWithItemsFromServer = mutation({
  args: {
    secret: v.string(),
    scanRunId: v.id("scanRuns"),
    period: v.union(v.literal("daily"), v.literal("weekly")),
    executiveSummary: v.string(),
    criticalCount: v.number(),
    highCount: v.number(),
    mediumCount: v.number(),
    lowCount: v.number(),
    items: v.array(
      v.object({
        watchTargetId: v.id("watchTargets"),
        rawItemIds: v.array(v.id("rawItems")),
        category: categoryValidator,
        significance: significanceValidator,
        headline: v.string(),
        synthesis: v.string(),
        strategicImplication: v.optional(v.string()),
        sources: v.array(v.object({ title: v.string(), url: v.string(), source: v.string(), date: v.optional(v.string()) })),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (!checkDigestSecret(args.secret)) throw new Error("Unauthorized");
    const { secret: _s, ...rest } = args;
    const totalSignals = rest.items.length;
    const digestRunId = await ctx.db.insert("digestRuns", {
      scanRunId: rest.scanRunId,
      generatedAt: Date.now(),
      period: rest.period,
      executiveSummary: rest.executiveSummary,
      totalSignals,
      criticalCount: rest.criticalCount,
      highCount: rest.highCount,
      mediumCount: rest.mediumCount,
      lowCount: rest.lowCount,
      slackPosted: false,
    });
    for (const item of rest.items) {
      await ctx.db.insert("digestItems", {
        digestRunId,
        watchTargetId: item.watchTargetId,
        rawItemIds: item.rawItemIds,
        category: item.category,
        significance: item.significance,
        headline: item.headline,
        synthesis: item.synthesis,
        strategicImplication: item.strategicImplication,
        sources: item.sources,
      });
    }
    return digestRunId;
  },
});

export const createDigestRunWithItems = internalMutation({
  args: {
    scanRunId: v.id("scanRuns"),
    period: v.union(v.literal("daily"), v.literal("weekly")),
    executiveSummary: v.string(),
    criticalCount: v.number(),
    highCount: v.number(),
    mediumCount: v.number(),
    lowCount: v.number(),
    items: v.array(
      v.object({
        watchTargetId: v.id("watchTargets"),
        rawItemIds: v.array(v.id("rawItems")),
        category: categoryValidator,
        significance: significanceValidator,
        headline: v.string(),
        synthesis: v.string(),
        strategicImplication: v.optional(v.string()),
        sources: v.array(v.object({ title: v.string(), url: v.string(), source: v.string(), date: v.optional(v.string()) })),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const totalSignals = args.items.length;
    const digestRunId = await ctx.db.insert("digestRuns", {
      scanRunId: args.scanRunId,
      generatedAt: Date.now(),
      period: args.period,
      executiveSummary: args.executiveSummary,
      totalSignals,
      criticalCount: args.criticalCount,
      highCount: args.highCount,
      mediumCount: args.mediumCount,
      lowCount: args.lowCount,
      slackPosted: false,
    });
    for (const item of args.items) {
      await ctx.db.insert("digestItems", {
        digestRunId,
        watchTargetId: item.watchTargetId,
        rawItemIds: item.rawItemIds,
        category: item.category,
        significance: item.significance,
        headline: item.headline,
        synthesis: item.synthesis,
        strategicImplication: item.strategicImplication,
        sources: item.sources,
      });
    }
    return digestRunId;
  },
});

export const generate = internalAction({
  args: { scanRunId: v.id("scanRuns") },
  handler: async (ctx, { scanRunId }) => {
    const [newItems, targets, scan] = await Promise.all([
      ctx.runQuery(internal.rawItems.getNewByScanRun, { scanRunId }),
      ctx.runQuery(api.watchTargets.listActive, {}),
      ctx.runQuery(api.scans.get, { id: scanRunId }),
    ]);
    if (newItems.length === 0 && scan?.period !== "weekly") return;
    const period = scan?.period ?? "daily";

    // One signal per source: one digest item per raw item, using each item's title and abstract (main point).
    const limit = 50;
    const items = newItems.slice(0, limit).map((item) => {
      const headline = item.title;
      const rawSynthesis = ((item.abstract ?? item.fullText ?? item.title ?? "") as string).trim() || item.title;
      const synthesis = synthesisEquivalentToHeadline(headline, rawSynthesis) ? "No additional summary available." : rawSynthesis;
      return {
        watchTargetId: item.watchTargetId,
        rawItemIds: [item._id],
        category: categoryForSource(item.source),
        significance: "medium" as const,
        headline,
        synthesis,
        strategicImplication: undefined as string | undefined,
        sources: [
          {
            title: item.title,
            url: item.url,
            source: item.source,
            date: formatSourceDate(item.source, item.publishedAt, item.metadata),
          },
        ],
      };
    });

    const lowCount = items.length;
    const executiveSummary =
      items.length === 0
        ? "No new sources this period."
        : `${items.length} new source${items.length === 1 ? "" : "s"} this period.`;

    await ctx.runMutation(internal.digests.createDigestRunWithItems, {
      scanRunId,
      period,
      executiveSummary,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount,
      items,
    });
  },
});
