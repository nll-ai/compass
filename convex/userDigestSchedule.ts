import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getOrCreateUserId, getUserIdFromIdentity } from "./lib/auth";

/** Current user's global digest schedule (Settings), if any. */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("userDigestSchedule")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

/** Upsert global digest schedule from parsed schedule fields (client parses NL via /api/schedule/parse). */
export const set = mutation({
  args: {
    timezone: v.string(),
    dailyEnabled: v.boolean(),
    dailyHour: v.number(),
    dailyMinute: v.number(),
    weeklyEnabled: v.boolean(),
    weeklyDayOfWeek: v.number(),
    weeklyHour: v.number(),
    weeklyMinute: v.number(),
    weekdaysOnly: v.optional(v.boolean()),
    rawDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getOrCreateUserId(ctx);
    const now = Date.now();
    const existing = await ctx.db
      .query("userDigestSchedule")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    const doc = {
      userId,
      ...args,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        lastDailyRunDate: undefined,
        lastWeeklyRunDate: undefined,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("userDigestSchedule", {
      ...doc,
      lastDailyRunDate: undefined,
      lastWeeklyRunDate: undefined,
    });
  },
});

/** Remove global digest schedule. */
export const remove = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getOrCreateUserId(ctx);
    const row = await ctx.db
      .query("userDigestSchedule")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (row) await ctx.db.delete(row._id);
  },
});
