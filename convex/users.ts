import { v } from "convex/values";
import { query } from "./_generated/server";
import { getIdentity } from "./lib/auth";

/** Get user by Convex id (for internal use). */
export const get = query({
  args: { id: v.id("users") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

/** Get current user id from identity; returns null if not authenticated. Does not create user. */
export const getCurrentUserId = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getIdentity(ctx);
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_workosId", (q) => q.eq("workosId", identity.subject))
      .first();
    return user?._id ?? null;
  },
});
