import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { getUserIdFromIdentity } from "./lib/auth";

/** Current user's team, if any. */
export const getMyTeam = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user?.teamId) return null;
    return await ctx.db.get(user.teamId);
  },
});

/** Members of the current user's team (same teamId). */
export const listTeamMembers = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user?.teamId) return [];
    return await ctx.db
      .query("users")
      .withIndex("by_teamId", (q) => q.eq("teamId", user.teamId))
      .collect();
  },
});

/**
 * One-time bootstrap: assign teams from email domains, migrate targets, auto-subscribe owners.
 * Run once from Convex dashboard or CLI: `npx convex run teams:runTeamBootstrap '{"secret":"YOUR_MIGRATION_SECRET"}'`
 * (requires `MIGRATION_SECRET` in Convex env).
 */
export const runTeamBootstrap = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    if (
      typeof process.env.MIGRATION_SECRET !== "string" ||
      process.env.MIGRATION_SECRET.length === 0 ||
      secret !== process.env.MIGRATION_SECRET
    ) {
      throw new Error("Unauthorized");
    }
    const users = await ctx.db.query("users").collect();
    const now = Date.now();
    let teamsCreated = 0;
    let usersPatched = 0;
    let targetsPatched = 0;
    let subsCreated = 0;

    function domainFromEmail(email: string): string | null {
      const i = email.indexOf("@");
      if (i < 0) return null;
      const d = email.slice(i + 1).toLowerCase().trim();
      return d || null;
    }

    const domainToTeamId = new Map<string, Id<"teams">>();

    for (const u of users) {
      const domain = domainFromEmail(u.email);
      if (!domain) continue;
      let teamId = domainToTeamId.get(domain);
      if (!teamId) {
        let team = await ctx.db
          .query("teams")
          .withIndex("by_domain", (q) => q.eq("domain", domain))
          .first();
        if (!team) {
          teamId = await ctx.db.insert("teams", {
            name: domain,
            domain,
            createdAt: now,
            updatedAt: now,
          });
          teamsCreated++;
        } else {
          teamId = team._id;
        }
        domainToTeamId.set(domain, teamId);
      }
      if (u.teamId !== teamId) {
        await ctx.db.patch(u._id, { teamId, updatedAt: now });
        usersPatched++;
      }
    }

    for (const u of users) {
      const domain = domainFromEmail(u.email);
      const teamId = domain ? domainToTeamId.get(domain) : undefined;
      const targets = await ctx.db
        .query("watchTargets")
        .withIndex("by_userId", (q) => q.eq("userId", u._id))
        .collect();
      for (const t of targets) {
        const patch: {
          teamId?: typeof teamId;
          createdByUserId?: typeof u._id;
        } = {};
        if (teamId && t.teamId !== teamId) patch.teamId = teamId;
        if (t.createdByUserId == null && t.userId === u._id) patch.createdByUserId = u._id;
        if (Object.keys(patch).length > 0) {
          await ctx.db.patch(t._id, { ...patch, updatedAt: now });
          targetsPatched++;
        }
        const existingSub = await ctx.db
          .query("targetSubscriptions")
          .withIndex("by_user_target", (q) =>
            q.eq("userId", u._id).eq("watchTargetId", t._id),
          )
          .first();
        if (!existingSub) {
          await ctx.db.insert("targetSubscriptions", {
            userId: u._id,
            watchTargetId: t._id,
            subscribedAt: now,
          });
          subsCreated++;
        }
      }
    }

    return { teamsCreated, usersPatched, targetsPatched, subsCreated };
  },
});
