import { v } from "convex/values";
import { query } from "./_generated/server";

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("digestRuns")
      .withIndex("by_generatedAt")
      .order("desc")
      .take(limit);
  },
});

export const get = query({
  args: { id: v.id("digestRuns") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});
