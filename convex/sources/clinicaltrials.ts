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
      source: "clinicaltrials",
      status: "running",
      startedAt: Date.now(),
    });
    let totalFound = 0;
    let newFound = 0;
    try {
      for (const target of targets) {
        const query = [target.name, ...target.aliases].slice(0, 3).join(" ");
        const url = `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(query)}&pageSize=5`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = (await res.json()) as {
          studies?: Array<{
            protocolSection?: {
              identificationModule?: { nctId?: string; briefTitle?: string };
              statusModule?: { startDateStruct?: { date?: string } };
            };
          }>;
        };
        const studies = data.studies ?? [];
        for (const study of studies) {
          const nctId = study.protocolSection?.identificationModule?.nctId ?? "";
          const title = study.protocolSection?.identificationModule?.briefTitle ?? nctId;
          const startDate = study.protocolSection?.statusModule?.startDateStruct?.date;
          let publishedAt: number | undefined = startDate ? new Date(startDate).getTime() : undefined;
          if (publishedAt != null && Number.isNaN(publishedAt)) publishedAt = undefined;
          if (!nctId) continue;
          const existing = await ctx.runQuery(internal.rawItems.getByExternalId, {
            source: "clinicaltrials",
            externalId: nctId,
          });
          const isNew = !existing;
          if (existing) continue;
          await ctx.runMutation(internal.rawItems.insertRawItem, {
            scanRunId,
            watchTargetId: target._id,
            source: "clinicaltrials",
            externalId: nctId,
            title,
            url: `https://clinicaltrials.gov/study/${nctId}`,
            abstract: undefined,
            publishedAt,
            metadata: startDate != null ? { startDate } : {},
            isNew,
          });
          totalFound++;
          if (isNew) newFound++;
        }
      }
      await ctx.runMutation(internal.scans.updateSourceStatus, {
        scanRunId,
        source: "clinicaltrials",
        status: "completed",
        itemsFound: totalFound,
        completedAt: Date.now(),
      });
    } catch (err) {
      await ctx.runMutation(internal.scans.updateSourceStatus, {
        scanRunId,
        source: "clinicaltrials",
        status: "failed",
        itemsFound: totalFound,
        error: err instanceof Error ? err.message : String(err),
        completedAt: Date.now(),
      });
    }
    return { totalFound, newFound };
  },
});
