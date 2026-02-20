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
      source: "pubmed",
      status: "running",
      startedAt: Date.now(),
    });
    let totalFound = 0;
    let newFound = 0;
    try {
      const apiKey = process.env.PUBMED_API_KEY;
      for (const target of targets) {
        const query = [target.name, ...target.aliases].slice(0, 3).join(" OR ");
        const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=5&retmode=json${apiKey ? `&api_key=${apiKey}` : ""}`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = (await res.json()) as { esearchresult?: { idlist?: string[] } };
        const idlist = data.esearchresult?.idlist ?? [];
        for (const pmid of idlist) {
          const existing = await ctx.runQuery(internal.rawItems.getByExternalId, {
            source: "pubmed",
            externalId: pmid,
          });
          const isNew = !existing;
          if (existing) continue;
          await ctx.runMutation(internal.rawItems.insertRawItem, {
            scanRunId,
            watchTargetId: target._id,
            source: "pubmed",
            externalId: pmid,
            title: `PubMed ${pmid}`,
            url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
            abstract: undefined,
            publishedAt: undefined,
            metadata: {},
            isNew,
          });
          totalFound++;
          if (isNew) newFound++;
        }
      }
      await ctx.runMutation(internal.scans.updateSourceStatus, {
        scanRunId,
        source: "pubmed",
        status: "completed",
        itemsFound: totalFound,
        completedAt: Date.now(),
      });
    } catch (err) {
      await ctx.runMutation(internal.scans.updateSourceStatus, {
        scanRunId,
        source: "pubmed",
        status: "failed",
        itemsFound: totalFound,
        error: err instanceof Error ? err.message : String(err),
        completedAt: Date.now(),
      });
    }
    return { totalFound, newFound };
  },
});
