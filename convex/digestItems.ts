import { v } from "convex/values";
import { query } from "./_generated/server";

export const listByDigestRun = query({
  args: { digestRunId: v.id("digestRuns") },
  handler: async (ctx, { digestRunId }) => {
    return await ctx.db
      .query("digestItems")
      .withIndex("by_digestRun", (q) => q.eq("digestRunId", digestRunId))
      .collect();
  },
});
