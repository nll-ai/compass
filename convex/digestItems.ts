import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listByDigestRun = query({
  args: { digestRunId: v.id("digestRuns") },
  handler: async (ctx, { digestRunId }) => {
    return await ctx.db
      .query("digestItems")
      .withIndex("by_digestRun", (q) => q.eq("digestRunId", digestRunId))
      .collect();
  },
});

/** List signals (digest items) for a watch target across all digest runs, newest first. */
export const listByWatchTarget = query({
  args: { watchTargetId: v.id("watchTargets"), limit: v.optional(v.number()) },
  handler: async (ctx, { watchTargetId, limit = 60 }) => {
    const items = await ctx.db
      .query("digestItems")
      .withIndex("by_watchTarget", (q) => q.eq("watchTargetId", watchTargetId))
      .take(limit * 2);
    const withRun = await Promise.all(
      items.map(async (item) => {
        const run = await ctx.db.get(item.digestRunId);
        return { item, generatedAt: run?.generatedAt ?? 0 };
      })
    );
    withRun.sort((a, b) => b.generatedAt - a.generatedAt);
    return withRun.slice(0, limit).map(({ item }) => item);
  },
});

export const setFeedback = mutation({
  args: {
    digestItemId: v.id("digestItems"),
    feedback: v.union(v.literal("good"), v.literal("bad")),
  },
  handler: async (ctx, { digestItemId, feedback }) => {
    const now = Date.now();
    await ctx.db.patch(digestItemId, { feedback, feedbackAt: now });
    return digestItemId;
  },
});

/** Returns recent user feedback for use in digest prompt tuning. Good/bad examples. */
export const getFeedbackForPrompt = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 40 }) => {
    const all = await ctx.db.query("digestItems").collect();
    const withFeedback = all.filter((d) => d.feedback != null);
    withFeedback.sort((a, b) => (b.feedbackAt ?? 0) - (a.feedbackAt ?? 0));
    const recent = withFeedback.slice(0, limit);
    return {
      good: recent.filter((d) => d.feedback === "good").map((d) => ({ headline: d.headline, synthesis: d.synthesis })),
      bad: recent.filter((d) => d.feedback === "bad").map((d) => ({ headline: d.headline, synthesis: d.synthesis })),
    };
  },
});
