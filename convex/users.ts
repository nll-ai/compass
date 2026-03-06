import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

/** Internal: get user by id (no auth). Used by email action to resolve digest recipient. */
export const getUserById = internalQuery({
  args: { id: v.id("users") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});
