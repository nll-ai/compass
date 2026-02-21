import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/** Set thumbs up/down for a source link. Thumbs down hides it from the timeline. */
export const setFeedback = mutation({
  args: {
    rawItemId: v.id("rawItems"),
    feedback: v.union(v.literal("good"), v.literal("bad")),
  },
  handler: async (ctx, { rawItemId, feedback }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("sourceLinkFeedback")
      .withIndex("by_rawItem", (q) => q.eq("rawItemId", rawItemId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { feedback, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("sourceLinkFeedback", { rawItemId, feedback, updatedAt: now });
  },
});

/** Get feedback for many raw items (e.g. to show thumb state on timeline). */
export const getFeedbackMap = query({
  args: { rawItemIds: v.array(v.id("rawItems")) },
  handler: async (ctx, { rawItemIds }) => {
    const map = new Map<string, "good" | "bad">();
    for (const id of rawItemIds) {
      const row = await ctx.db
        .query("sourceLinkFeedback")
        .withIndex("by_rawItem", (q) => q.eq("rawItemId", id))
        .first();
      if (row) map.set(id, row.feedback);
    }
    return Object.fromEntries(map);
  },
});
