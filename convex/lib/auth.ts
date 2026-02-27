import type { GenericQueryCtx, GenericMutationCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel";
import type { Id } from "../_generated/dataModel";

type QueryCtx = GenericQueryCtx<DataModel>;
type MutationCtx = GenericMutationCtx<DataModel>;
type AnyCtx = QueryCtx | MutationCtx;

/**
 * Returns the current user's Convex identity (from JWT), or null if unauthenticated.
 */
export async function getIdentity(ctx: AnyCtx) {
  return await ctx.auth.getUserIdentity();
}

/**
 * Resolves the current identity to a Convex userId (Id<"users">).
 * Returns null if not authenticated.
 * Does not create the user; use getOrCreateUserId in mutations for that.
 */
export async function getUserIdFromIdentity(ctx: QueryCtx): Promise<Id<"users"> | null> {
  const identity = await getIdentity(ctx);
  if (!identity) return null;
  const workosId = identity.subject;
  const user = await ctx.db
    .query("users")
    .withIndex("by_workosId", (q) => q.eq("workosId", workosId))
    .first();
  return user?._id ?? null;
}

/**
 * In a mutation: get the current user's Id<"users">, creating the user record if needed.
 * Throws if not authenticated.
 */
export async function getOrCreateUserId(ctx: MutationCtx): Promise<Id<"users">> {
  const identity = await getIdentity(ctx);
  if (!identity) throw new Error("Unauthorized: authentication required");
  const workosId = identity.subject;
  const id = identity as Record<string, unknown>;
  const email = String(id["profile.email"] ?? "");
  const firstName = id["profile.firstName"] as string | undefined;
  const lastName = id["profile.lastName"] as string | undefined;

  const existing = await ctx.db
    .query("users")
    .withIndex("by_workosId", (q) => q.eq("workosId", workosId))
    .first();
  if (existing) {
    const now = Date.now();
    await ctx.db.patch(existing._id, {
      email,
      firstName: firstName ?? existing.firstName,
      lastName: lastName ?? existing.lastName,
      updatedAt: now,
    });
    return existing._id;
  }
  const now = Date.now();
  return await ctx.db.insert("users", {
    workosId,
    email,
    firstName,
    lastName,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Throws if the current user is not authenticated.
 */
export async function requireIdentity(ctx: AnyCtx) {
  const identity = await getIdentity(ctx);
  if (!identity) {
    throw new Error("Unauthorized: authentication required");
  }
  return identity;
}

/**
 * Returns true if the current user owns the given watch target.
 */
export async function userOwnsTarget(
  ctx: QueryCtx,
  watchTargetId: import("../_generated/dataModel").Id<"watchTargets">,
): Promise<boolean> {
  const userId = await getUserIdFromIdentity(ctx);
  if (!userId) return false;
  const target = await ctx.db.get(watchTargetId);
  return target?.userId === userId;
}

/**
 * Returns true if the current user owns the digest run (via its scan run's targetIds).
 */
export async function userOwnsDigestRun(
  ctx: QueryCtx,
  digestRunId: import("../_generated/dataModel").Id<"digestRuns">,
): Promise<boolean> {
  const userId = await getUserIdFromIdentity(ctx);
  if (!userId) return false;
  const digestRun = await ctx.db.get(digestRunId);
  if (!digestRun) return false;
  const scanRun = await ctx.db.get(digestRun.scanRunId);
  if (!scanRun?.targetIds?.length) return false;
  const userTargets = await ctx.db
    .query("watchTargets")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  const userSet = new Set(userTargets.map((t) => t._id));
  return scanRun.targetIds.every((id) => userSet.has(id));
}
