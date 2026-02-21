import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

const targetValidator = v.object({
  _id: v.id("watchTargets"),
  name: v.string(),
  displayName: v.string(),
  aliases: v.array(v.string()),
});

export const scan = internalAction({
  args: {
    scanRunId: v.id("scanRuns"),
    targets: v.array(targetValidator),
  },
  handler: async (ctx, { scanRunId, targets }) => {
    await ctx.runMutation(internal.scans.updateSourceStatus, {
      scanRunId,
      source: "exa",
      status: "running",
      startedAt: Date.now(),
    });
    let totalFound = 0;
    let newFound = 0;
    const apiKey = process.env.EXA_API_KEY;
    if (!apiKey) {
      await ctx.runMutation(internal.scans.updateSourceStatus, {
        scanRunId,
        source: "exa",
        status: "completed",
        itemsFound: 0,
        completedAt: Date.now(),
      });
      return { totalFound: 0, newFound: 0 };
    }
    try {
      for (const target of targets) {
        const query = [target.name, ...target.aliases].slice(0, 3).join(" ");
        const res = await fetch("https://api.exa.ai/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            query: `${query} biopharma drug development clinical`,
            numResults: 5,
            type: "auto",
            contents: { text: { maxCharacters: 500 } },
          }),
        });
        if (!res.ok) continue;
        const data = (await res.json()) as {
          results?: Array<{ id: string; title?: string; url?: string; text?: string; publishedDate?: string }>;
        };
        const results = data.results ?? [];
        for (const hit of results) {
          const externalId = hit.id ?? hit.url ?? `${target._id}-${results.indexOf(hit)}`;
          const publishedDate = hit.publishedDate;
          let publishedAt: number | undefined =
            publishedDate != null ? new Date(publishedDate).getTime() : undefined;
          if (publishedAt != null && Number.isNaN(publishedAt)) publishedAt = undefined;
          const existing = await ctx.runQuery(internal.rawItems.getByExternalId, {
            source: "exa",
            externalId,
          });
          const isNew = !existing;
          if (existing) continue;
          await ctx.runMutation(internal.rawItems.insertRawItem, {
            scanRunId,
            watchTargetId: target._id,
            source: "exa",
            externalId,
            title: hit.title ?? hit.url ?? "Exa result",
            url: hit.url ?? "",
            abstract: hit.text ?? undefined,
            publishedAt,
            metadata: publishedDate != null ? { publishedDate } : {},
            isNew,
          });
          totalFound++;
          if (isNew) newFound++;
        }
      }
      await ctx.runMutation(internal.scans.updateSourceStatus, {
        scanRunId,
        source: "exa",
        status: "completed",
        itemsFound: totalFound,
        completedAt: Date.now(),
      });
    } catch (err) {
      await ctx.runMutation(internal.scans.updateSourceStatus, {
        scanRunId,
        source: "exa",
        status: "failed",
        itemsFound: totalFound,
        error: err instanceof Error ? err.message : String(err),
        completedAt: Date.now(),
      });
    }
    return { totalFound, newFound };
  },
});
