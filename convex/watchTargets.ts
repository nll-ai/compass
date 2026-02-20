import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("watchTargets")
      .withIndex("by_active", (q) => q.eq("active", true))
      .order("desc")
      .collect();
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("watchTargets").order("desc").collect();
  },
});

export const get = query({
  args: { id: v.id("watchTargets") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const getByIds = query({
  args: { ids: v.array(v.id("watchTargets")) },
  handler: async (ctx, { ids }) => {
    const results = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return results.filter((doc) => doc != null);
  },
});

const watchTargetValidator = {
  name: v.string(),
  displayName: v.string(),
  type: v.union(v.literal("drug"), v.literal("target"), v.literal("company")),
  aliases: v.array(v.string()),
  indication: v.optional(v.string()),
  company: v.optional(v.string()),
  therapeuticArea: v.union(
    v.literal("cardiovascular"),
    v.literal("oncology"),
    v.literal("other"),
  ),
  active: v.boolean(),
  notes: v.optional(v.string()),
};

export const create = mutation({
  args: watchTargetValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("watchTargets", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("watchTargets"),
    ...watchTargetValidator,
  },
  handler: async (ctx, args) => {
    const { id, ...rest } = args;
    await ctx.db.patch(id, { ...rest, updatedAt: Date.now() });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("watchTargets") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { active: false, updatedAt: Date.now() });
    return id;
  },
});
