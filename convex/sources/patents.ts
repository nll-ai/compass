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
      source: "patents",
      status: "running",
      startedAt: Date.now(),
    });
    try {
      await ctx.runMutation(internal.scans.updateSourceStatus, {
        scanRunId,
        source: "patents",
        status: "completed",
        itemsFound: 0,
        completedAt: Date.now(),
      });
    } catch (err) {
      await ctx.runMutation(internal.scans.updateSourceStatus, {
        scanRunId,
        source: "patents",
        status: "failed",
        itemsFound: 0,
        error: err instanceof Error ? err.message : String(err),
        completedAt: Date.now(),
      });
    }
    return { totalFound: 0, newFound: 0 };
  },
});
