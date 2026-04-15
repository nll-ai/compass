import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import { getUserIdFromIdentity } from "./lib/auth";

/** Internal: get user by id (no auth). Used by email action to resolve digest recipient. */
export const getUserById = internalQuery({
  args: { id: v.id("users") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

/** Signed-in user row for UI (e.g. digest assignee fallback when not on a team). */
export const getMe = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      email: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return { _id: user._id, email: typeof user.email === "string" ? user.email : "" };
  },
});
