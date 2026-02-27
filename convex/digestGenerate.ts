"use node";

import { createHash } from "crypto";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { formatSourceDate } from "./lib/formatters";
import { categoryForSource, synthesisEquivalentToHeadline } from "./lib/digestHelpers";

function computeSourceLinksHash(rawItemIds: string[]): string {
  const sorted = [...rawItemIds].sort();
  return createHash("sha256").update(sorted.join(",")).digest("hex");
}

export const generate = internalAction({
  args: { scanRunId: v.id("scanRuns") },
  handler: async (ctx, { scanRunId }) => {
    const scan = await ctx.runQuery(internal.scans.getScanRun, { id: scanRunId });
    if (!scan) return;
    const targetIds = scan.targetIds ?? [];
    const [newItems, targets] = await Promise.all([
      ctx.runQuery(internal.rawItems.getNewByScanRun, { scanRunId }),
      targetIds.length > 0
        ? ctx.runQuery(internal.watchTargets.getByIdsInternal, { ids: targetIds })
        : [],
    ]);
    if (newItems.length === 0 && scan.period !== "weekly") return;
    const period = scan?.period ?? "daily";

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

    const rawItemIds = items.flatMap((i) => i.rawItemIds);
    const sourceLinksHash = rawItemIds.length > 0 ? computeSourceLinksHash(rawItemIds) : undefined;
    if (sourceLinksHash) {
      const existing = await ctx.runQuery(api.digestRuns.getBySourceLinksHash, { sourceLinksHash });
      if (existing) return;
    }

    await ctx.runMutation(internal.digests.createDigestRunWithItems, {
      scanRunId,
      period,
      executiveSummary,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount,
      items,
      sourceLinksHash,
    });
  },
});
