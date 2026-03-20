import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getOrCreateUserId, getUserIdFromIdentity } from "./lib/auth";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ACTIVE_INVITES_PER_TEAM = 10;
const TOKEN_BYTES = 32;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmailAddress(raw: string): boolean {
  const s = raw.trim();
  if (s.length < 3 || s.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function randomInviteToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Team admin: explicit owner, or legacy team with no owner yet (any member may invite). */
function userIsTeamAdmin(team: Doc<"teams"> | null | undefined, userId: Id<"users">): boolean {
  if (!team) return false;
  if (team.ownerUserId == null) return true;
  return team.ownerUserId === userId;
}

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

/** Team row + membership flags for Settings (create / leave / invites). */
export const getMyMembership = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const team = user.teamId ? await ctx.db.get(user.teamId) : null;
    return {
      team,
      teamPreference: user.teamPreference,
      isTeamAdmin: userIsTeamAdmin(team, userId),
    };
  },
});

/** Create a named team and join as owner (admin). Requires no current `teamId`. */
export const createTeam = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await getOrCreateUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (user.teamId) {
      throw new Error("Leave your current team before creating a new one.");
    }
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Team name is required");
    const now = Date.now();
    const teamId = await ctx.db.insert("teams", {
      name: trimmed,
      ownerUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(userId, {
      teamId,
      teamPreference: undefined,
      updatedAt: now,
    });
    return teamId;
  },
});

/** Update the current team’s display name. Team admin only. */
export const renameTeam = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await getOrCreateUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user?.teamId) throw new Error("You are not on a team.");
    const teamId = user.teamId;
    const team = await ctx.db.get(teamId);
    if (!team) throw new Error("Team not found.");
    if (!userIsTeamAdmin(team, userId)) {
      throw new Error("Only a team admin can rename the team.");
    }
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Team name is required.");
    const now = Date.now();
    await ctx.db.patch(teamId, { name: trimmed, updatedAt: now });
    return { name: trimmed };
  },
});

/** Leave current team; if you were owner, ownership transfers to another member when possible. */
export const leaveTeam = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getOrCreateUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user?.teamId) return { left: false as const };
    const tid = user.teamId;
    const team = await ctx.db.get(tid);
    const now = Date.now();
    if (team && team.ownerUserId === userId) {
      const members = await ctx.db
        .query("users")
        .withIndex("by_teamId", (q) => q.eq("teamId", tid))
        .collect();
      const others = members.filter((m) => m._id !== userId);
      if (others.length > 0) {
        await ctx.db.patch(tid, { ownerUserId: others[0]!._id, updatedAt: now });
      } else {
        await ctx.db.patch(tid, { ownerUserId: undefined, updatedAt: now });
      }
    }
    const subs = await ctx.db
      .query("targetSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const s of subs) {
      const t = await ctx.db.get(s.watchTargetId);
      if (t && t.userId !== userId) {
        await ctx.db.delete(s._id);
      }
    }
    await ctx.db.patch(userId, {
      teamId: undefined,
      teamPreference: "solo",
      updatedAt: now,
    });
    return { left: true as const };
  },
});

/** Payload for Resend (internal). */
export const getTeamEmailInviteEmailContextInternal = internalQuery({
  args: { inviteId: v.id("teamEmailInvites") },
  handler: async (ctx, { inviteId }) => {
    const inv = await ctx.db.get(inviteId);
    if (!inv || inv.revokedAt || inv.acceptedAt) return null;
    const now = Date.now();
    if (inv.expiresAt <= now) return null;
    const team = await ctx.db.get(inv.teamId);
    const inviter = await ctx.db.get(inv.createdByUserId);
    if (!team || !inviter) return null;
    return {
      inviteeEmail: inv.emailLower,
      teamName: team.name,
      inviterEmail: inviter.email,
      token: inv.token,
    };
  },
});

/** Admin: invite a teammate by email (7-day expiry); schedules invite email. */
export const inviteTeamMemberByEmail = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const userId = await getOrCreateUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user?.teamId) throw new Error("You must be on a team to send invites.");
    const teamId = user.teamId;
    const team = await ctx.db.get(teamId);
    if (!team) throw new Error("Team not found.");
    if (!userIsTeamAdmin(team, userId)) {
      throw new Error("Only a team admin can invite teammates.");
    }
    const trimmed = email.trim();
    if (!isValidEmailAddress(trimmed)) {
      throw new Error("Enter a valid email address.");
    }
    const emailLower = normalizeEmail(trimmed);
    if (emailLower === normalizeEmail(user.email)) {
      throw new Error("You can’t invite your own account.");
    }
    const members = await ctx.db
      .query("users")
      .withIndex("by_teamId", (q) => q.eq("teamId", teamId))
      .collect();
    if (members.some((m) => normalizeEmail(m.email) === emailLower)) {
      throw new Error("That person is already on this team.");
    }
    const now = Date.now();
    const active = (
      await ctx.db
        .query("teamEmailInvites")
        .withIndex("by_teamId", (q) => q.eq("teamId", teamId))
        .collect()
    ).filter((i) => !i.revokedAt && !i.acceptedAt && i.expiresAt > now);
    if (active.length >= MAX_ACTIVE_INVITES_PER_TEAM) {
      throw new Error(`At most ${MAX_ACTIVE_INVITES_PER_TEAM} pending invites per team. Revoke one first.`);
    }
    const dupRows = await ctx.db
      .query("teamEmailInvites")
      .withIndex("by_team_email", (q) => q.eq("teamId", teamId).eq("emailLower", emailLower))
      .collect();
    if (
      dupRows.some((d) => !d.revokedAt && !d.acceptedAt && d.expiresAt > now)
    ) {
      throw new Error("An invite is already pending for that email.");
    }
    let inviteId: Id<"teamEmailInvites"> | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const token = randomInviteToken();
      const clash = await ctx.db
        .query("teamEmailInvites")
        .withIndex("by_token", (q) => q.eq("token", token))
        .first();
      if (clash) continue;
      inviteId = await ctx.db.insert("teamEmailInvites", {
        teamId,
        emailLower,
        token,
        createdByUserId: userId,
        createdAt: now,
        expiresAt: now + INVITE_TTL_MS,
      });
      break;
    }
    if (!inviteId) throw new Error("Could not create invite; try again.");
    await ctx.scheduler.runAfter(0, internal.email.sendTeamInviteEmail, { inviteId });
    return { inviteId, expiresAt: now + INVITE_TTL_MS };
  },
});

/**
 * Accept a team invite (signed-in user’s email must match the invite).
 * Pass exactly one of `token` (from email link) or `inviteId` (from pending list on Settings).
 */
export const acceptTeamEmailInvite = mutation({
  args: v.object({
    token: v.optional(v.string()),
    inviteId: v.optional(v.id("teamEmailInvites")),
  }),
  handler: async (ctx, { token, inviteId }) => {
    const userId = await getOrCreateUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (user.teamId) {
      throw new Error("Leave your current team before accepting an invite.");
    }
    const hasToken = token != null && String(token).trim().length > 0;
    const hasId = inviteId != null;
    if (hasToken === hasId) {
      throw new Error("Provide either token or inviteId (not both, not neither).");
    }
    let invite = null as Doc<"teamEmailInvites"> | null;
    if (hasToken) {
      const t = String(token).trim();
      if (t.length < 16) throw new Error("Invalid invite link.");
      invite = await ctx.db
        .query("teamEmailInvites")
        .withIndex("by_token", (q) => q.eq("token", t))
        .first();
    } else {
      invite = await ctx.db.get(inviteId!);
    }
    if (!invite || invite.revokedAt) {
      throw new Error("This invite is no longer valid.");
    }
    const now = Date.now();
    if (invite.expiresAt <= now) {
      throw new Error("This invite has expired.");
    }
    if (normalizeEmail(user.email) !== invite.emailLower) {
      throw new Error("Sign in with the email address that received the invite, then try again.");
    }
    const team = await ctx.db.get(invite.teamId);
    if (!team) throw new Error("Team no longer exists.");
    if (invite.acceptedAt) {
      if (user.teamId === invite.teamId) {
        return { teamId: invite.teamId };
      }
      throw new Error("This invite was already used.");
    }
    await ctx.db.patch(userId, {
      teamId: invite.teamId,
      teamPreference: undefined,
      updatedAt: now,
    });
    await ctx.db.patch(invite._id, { acceptedAt: now });
    return { teamId: invite.teamId };
  },
});

/** Admin: list pending email invites for the current team. */
export const listMyTeamInvites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user?.teamId) return [];
    const teamId = user.teamId;
    const team = await ctx.db.get(teamId);
    if (!team || !userIsTeamAdmin(team, userId)) return [];
    const now = Date.now();
    const rows = await ctx.db
      .query("teamEmailInvites")
      .withIndex("by_teamId", (q) => q.eq("teamId", teamId))
      .collect();
    return rows
      .filter((i) => !i.revokedAt && !i.acceptedAt && i.expiresAt > now)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((i) => ({
        _id: i._id,
        email: i.emailLower,
        createdAt: i.createdAt,
        expiresAt: i.expiresAt,
      }));
  },
});

/** User has no team: pending invites matching their sign-in email. */
export const listPendingTeamInvitesForMyEmail = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user || user.teamId) return [];
    const emailLower = normalizeEmail(user.email);
    const now = Date.now();
    const rows = await ctx.db
      .query("teamEmailInvites")
      .withIndex("by_emailLower", (q) => q.eq("emailLower", emailLower))
      .collect();
    const active = rows.filter((i) => !i.revokedAt && !i.acceptedAt && i.expiresAt > now);
    const out: { inviteId: Id<"teamEmailInvites">; teamName: string; expiresAt: number }[] = [];
    for (const i of active) {
      const team = await ctx.db.get(i.teamId);
      if (team) {
        out.push({ inviteId: i._id, teamName: team.name, expiresAt: i.expiresAt });
      }
    }
    out.sort((a, b) => b.expiresAt - a.expiresAt);
    return out;
  },
});

/** Admin: revoke a pending invite. */
export const revokeTeamInvite = mutation({
  args: { inviteId: v.id("teamEmailInvites") },
  handler: async (ctx, { inviteId }) => {
    const userId = await getOrCreateUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user?.teamId) throw new Error("Not on a team.");
    const team = await ctx.db.get(user.teamId);
    if (!team || !userIsTeamAdmin(team, userId)) {
      throw new Error("Only a team admin can revoke invites.");
    }
    const invite = await ctx.db.get(inviteId);
    if (!invite || invite.teamId !== user.teamId) {
      throw new Error("Invite not found.");
    }
    const now = Date.now();
    await ctx.db.patch(inviteId, { revokedAt: now });
    return { revoked: true as const };
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
    let ownersBackfilled = 0;

    function domainFromEmail(email: string): string | null {
      const i = email.indexOf("@");
      if (i < 0) return null;
      const d = email.slice(i + 1).toLowerCase().trim();
      return d || null;
    }

    const domainToTeamId = new Map<string, Id<"teams">>();

    for (const u of users) {
      if (u.teamPreference === "solo") continue;
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
      const teamId =
        u.teamPreference === "solo"
          ? u.teamId
          : domain
            ? domainToTeamId.get(domain)
            : undefined;
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

    const allTeams = await ctx.db.query("teams").collect();
    for (const team of allTeams) {
      if (team.ownerUserId != null) continue;
      const first = await ctx.db
        .query("users")
        .withIndex("by_teamId", (q) => q.eq("teamId", team._id))
        .first();
      if (first) {
        await ctx.db.patch(team._id, { ownerUserId: first._id, updatedAt: now });
        ownersBackfilled++;
      }
    }

    return { teamsCreated, usersPatched, targetsPatched, subsCreated, ownersBackfilled };
  },
});
