import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getOrCreateUserId, getUserIdFromIdentity, getVisibleWatchTargetIds, userOwnsTarget } from "./lib/auth";

/** Get scan schedule for a single watch target, if any. Caller must own the target. */
export const getForTarget = query({
  args: { watchTargetId: v.id("watchTargets") },
  handler: async (ctx, { watchTargetId }) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return null;
    if (!(await userOwnsTarget(ctx, watchTargetId))) return null;
    return await ctx.db
      .query("watchTargetSchedule")
      .withIndex("by_watchTarget", (q) => q.eq("watchTargetId", watchTargetId))
      .first();
  },
});

/** List all per-target schedules for the current user's targets. */
export const listPerTargetSchedules = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return [];
    const visible = await getVisibleWatchTargetIds(ctx, userId);
    const all = await ctx.db.query("watchTargetSchedule").collect();
    return all.filter((s) => visible.has(s.watchTargetId));
  },
});

/** Set scan schedule for a single watch target (upsert). Caller must own the target. */
export const setForTarget = mutation({
  args: {
    watchTargetId: v.id("watchTargets"),
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
    const { watchTargetId, ...rest } = args;
    if (!(await userOwnsTarget(ctx, watchTargetId))) throw new Error("Unauthorized");
    const target = await ctx.db.get(watchTargetId);
    if (!target) throw new Error("Not found");
    const now = Date.now();
    const existing = await ctx.db
      .query("watchTargetSchedule")
      .withIndex("by_watchTarget", (q) => q.eq("watchTargetId", watchTargetId))
      .first();
    const doc = { ...rest, updatedAt: now };
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...doc,
        lastDailyRunDate: undefined,
        lastWeeklyRunDate: undefined,
      });
      return existing._id;
    }
    return await ctx.db.insert("watchTargetSchedule", {
      watchTargetId,
      ...doc,
      lastDailyRunDate: undefined,
      lastWeeklyRunDate: undefined,
    });
  },
});

/** Remove per-target schedule for a watch target. Caller must own the target. */
export const removeForTarget = mutation({
  args: { watchTargetId: v.id("watchTargets") },
  handler: async (ctx, { watchTargetId }) => {
    await getOrCreateUserId(ctx);
    if (!(await userOwnsTarget(ctx, watchTargetId))) throw new Error("Unauthorized");
    const target = await ctx.db.get(watchTargetId);
    if (!target) throw new Error("Not found");
    const row = await ctx.db
      .query("watchTargetSchedule")
      .withIndex("by_watchTarget", (q) => q.eq("watchTargetId", watchTargetId))
      .first();
    if (row) await ctx.db.delete(row._id);
  },
});

/** Return current date and time in the given IANA timezone (e.g. "America/New_York"). */
function nowInTimezone(timezone: string): { dateKey: string; weekday: number; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    weekday: "short",
  });
  const now = new Date();
  const parts = formatter.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "0";
  const dateKey = `${get("year")}-${get("month")}-${get("day")}`;
  const weekday = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(get("weekday").toLowerCase().slice(0, 3));
  const hour = parseInt(get("hour"), 10);
  const minute = parseInt(get("minute"), 10);
  return { dateKey, weekday: weekday >= 0 ? weekday : 0, hour, minute };
}

/** Monday of the week for the given date key (YYYY-MM-DD). */
function mondayOfWeek(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

async function activeDigestTargetIdsForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Id<"watchTargets">[]> {
  const user = await ctx.db.get(userId);
  const subs = await ctx.db
    .query("targetSubscriptions")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  if (user?.teamId != null && subs.length > 0) {
    const out: Id<"watchTargets">[] = [];
    for (const s of subs) {
      const t = await ctx.db.get(s.watchTargetId);
      if (t?.active) out.push(t._id);
    }
    return out;
  }
  const owned = await ctx.db
    .query("watchTargets")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .filter((q) => q.eq(q.field("active"), true))
    .collect();
  return owned.map((t) => t._id);
}

type DigestCronGroup = {
  targetIds: Set<Id<"watchTargets">>;
  userIds: Set<Id<"users">>;
  rowIds: Id<"userDigestSchedule">[];
  dateKey: string;
  weekKey?: string;
};

/** Check if we should run daily/weekly and trigger scan. Runs every minute from cron; triggers at the exact scheduled minute. */
export const checkAndTrigger = internalMutation({
  args: {},
  handler: async (ctx) => {
    // --- Per-user global digest schedule (Settings): grouped by team + local slot to dedupe scans ---
    const userSchedules = await ctx.db.query("userDigestSchedule").collect();
    const dailyGroups = new Map<string, DigestCronGroup>();
    const weeklyGroups = new Map<string, DigestCronGroup>();

    for (const row of userSchedules) {
      const tz = row.timezone || "UTC";
      const { dateKey, weekday, hour, minute } = nowInTimezone(tz);
      const user = await ctx.db.get(row.userId);
      const teamKey = user?.teamId ?? "solo";

      if (row.dailyEnabled && hour === row.dailyHour && minute === row.dailyMinute) {
        const skipWeekdays = row.weekdaysOnly && (weekday === 0 || weekday === 6);
        if (!skipWeekdays && row.lastDailyRunDate !== dateKey) {
          const targets = await activeDigestTargetIdsForUser(ctx, row.userId);
          const gk = `${teamKey}|d|${tz}|${dateKey}|${hour}|${minute}`;
          let g = dailyGroups.get(gk);
          if (!g) {
            g = { targetIds: new Set(), userIds: new Set(), rowIds: [], dateKey };
            dailyGroups.set(gk, g);
          }
          for (const id of targets) g.targetIds.add(id);
          g.userIds.add(row.userId);
          g.rowIds.push(row._id);
        }
      }

      if (row.weeklyEnabled && row.weeklyDayOfWeek === weekday && hour === row.weeklyHour && minute === row.weeklyMinute) {
        const weekKey = mondayOfWeek(dateKey);
        if (row.lastWeeklyRunDate !== weekKey) {
          const targets = await activeDigestTargetIdsForUser(ctx, row.userId);
          const gk = `${teamKey}|w|${tz}|${weekKey}|${weekday}|${hour}|${minute}`;
          let g = weeklyGroups.get(gk);
          if (!g) {
            g = { targetIds: new Set(), userIds: new Set(), rowIds: [], dateKey, weekKey };
            weeklyGroups.set(gk, g);
          }
          for (const id of targets) g.targetIds.add(id);
          g.userIds.add(row.userId);
          g.rowIds.push(row._id);
        }
      }
    }

    const now = Date.now();
    for (const g of dailyGroups.values()) {
      const targetIds = [...g.targetIds];
      const userIds = [...g.userIds];
      if (targetIds.length > 0 && userIds.length > 0) {
        await ctx.scheduler.runAfter(0, internal.scans.scheduleScan, {
          period: "daily",
          targetIds,
          digestNotifyUserIds: userIds,
        });
      }
      for (const rid of g.rowIds) {
        await ctx.db.patch(rid, { lastDailyRunDate: g.dateKey, updatedAt: now });
      }
    }

    for (const g of weeklyGroups.values()) {
      const targetIds = [...g.targetIds];
      const userIds = [...g.userIds];
      const wk = g.weekKey ?? mondayOfWeek(g.dateKey);
      if (targetIds.length > 0 && userIds.length > 0) {
        await ctx.scheduler.runAfter(0, internal.scans.scheduleScan, {
          period: "weekly",
          targetIds,
          digestNotifyUserIds: userIds,
        });
      }
      for (const rid of g.rowIds) {
        await ctx.db.patch(rid, { lastWeeklyRunDate: wk, updatedAt: now });
      }
    }

    // --- Per-target schedules: scan only that target ---
    const targetSchedules = await ctx.db.query("watchTargetSchedule").collect();
    for (const row of targetSchedules) {
      const tz = row.timezone || "UTC";
      const { dateKey, weekday, hour, minute } = nowInTimezone(tz);

      if (row.dailyEnabled && hour === row.dailyHour && minute === row.dailyMinute) {
        const skipWeekdays = row.weekdaysOnly && (weekday === 0 || weekday === 6);
        if (!skipWeekdays && row.lastDailyRunDate !== dateKey) {
          await ctx.scheduler.runAfter(0, internal.scans.scheduleScan, {
            period: "daily",
            targetIds: [row.watchTargetId],
          });
          await ctx.db.patch(row._id, { lastDailyRunDate: dateKey, updatedAt: Date.now() });
        }
      }
      if (row.weeklyEnabled && row.weeklyDayOfWeek === weekday && hour === row.weeklyHour && minute === row.weeklyMinute) {
        const weekKey = mondayOfWeek(dateKey);
        if (row.lastWeeklyRunDate !== weekKey) {
          await ctx.scheduler.runAfter(0, internal.scans.scheduleScan, {
            period: "weekly",
            targetIds: [row.watchTargetId],
          });
          await ctx.db.patch(row._id, { lastWeeklyRunDate: weekKey, updatedAt: Date.now() });
        }
      }
    }
  },
});
