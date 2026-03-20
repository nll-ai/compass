import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { getOrCreateUserId, getUserIdFromIdentity } from "./lib/auth";

/** Watch target IDs the current user is subscribed to. */
export const listMySubscribedTargetIds = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return [];
    const subs = await ctx.db
      .query("targetSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    return subs.map((s) => s.watchTargetId);
  },
});

/**
 * Internal: for digest email filtering.
 * Returns null if user is not on a team (legacy): caller should include all digest items in the scan run.
 * Returns array (possibly empty) if user has teamId: only these watch targets appear in their email.
 */
export const getSubscribedWatchTargetIdsForUserInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user?.teamId) return null;
    const subs = await ctx.db
      .query("targetSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    return subs.map((s) => s.watchTargetId);
  },
});

export const subscribe = mutation({
  args: { watchTargetId: v.id("watchTargets") },
  handler: async (ctx, { watchTargetId }) => {
    const userId = await getOrCreateUserId(ctx);
    const user = await ctx.db.get(userId);
    const target = await ctx.db.get(watchTargetId);
    if (!target) throw new Error("Watch target not found");
    const canSee =
      target.userId === userId ||
      (user?.teamId != null && target.teamId === user.teamId);
    if (!canSee) throw new Error("Unauthorized");
    const existing = await ctx.db
      .query("targetSubscriptions")
      .withIndex("by_user_target", (q) =>
        q.eq("userId", userId).eq("watchTargetId", watchTargetId),
      )
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("targetSubscriptions", {
      userId,
      watchTargetId,
      subscribedAt: Date.now(),
    });
  },
});

export const unsubscribe = mutation({
  args: { watchTargetId: v.id("watchTargets") },
  handler: async (ctx, { watchTargetId }) => {
    const userId = await getOrCreateUserId(ctx);
    const row = await ctx.db
      .query("targetSubscriptions")
      .withIndex("by_user_target", (q) =>
        q.eq("userId", userId).eq("watchTargetId", watchTargetId),
      )
      .first();
    if (row) await ctx.db.delete(row._id);
  },
});

/** User IDs subscribed to a watch target (same team visibility). */
export const listSubscribersForTarget = query({
  args: { watchTargetId: v.id("watchTargets") },
  handler: async (ctx, { watchTargetId }) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return [];
    const target = await ctx.db.get(watchTargetId);
    if (!target) return [];
    const user = await ctx.db.get(userId);
    const canSee =
      target.userId === userId ||
      (user?.teamId != null && target.teamId === user.teamId);
    if (!canSee) return [];
    const subs = await ctx.db
      .query("targetSubscriptions")
      .withIndex("by_watchTarget", (q) => q.eq("watchTargetId", watchTargetId))
      .collect();
    return subs.map((s) => s.userId);
  },
});

export const isSubscribed = query({
  args: { watchTargetId: v.id("watchTargets") },
  handler: async (ctx, { watchTargetId }) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return false;
    const row = await ctx.db
      .query("targetSubscriptions")
      .withIndex("by_user_target", (q) =>
        q.eq("userId", userId).eq("watchTargetId", watchTargetId),
      )
      .first();
    return row != null;
  },
});
