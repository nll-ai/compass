import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { getOrCreateUserId, getUserIdFromIdentity } from "./lib/auth";
import {
  isDecisionBriefEnabledByDefault,
  resolveDecisionBriefEnabled,
  type DecisionBriefPreference,
} from "../lib/digestDecisionPreference";
import { clampDigestEmailLookbackDays } from "../lib/scan/lookback";

const decisionBriefPreferenceValidator = v.union(
  v.literal("inherit"),
  v.literal("enabled"),
  v.literal("disabled"),
);

function checkScanSecret(secret: string): boolean {
  return (
    typeof process.env.SCAN_SECRET === "string" &&
    process.env.SCAN_SECRET.length > 0 &&
    secret === process.env.SCAN_SECRET
  );
}

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
      decisionBriefPreference: v.optional(decisionBriefPreferenceValidator),
      digestEmailLookbackDays: v.optional(v.number()),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      _id: user._id,
      email: typeof user.email === "string" ? user.email : "",
      decisionBriefPreference:
        user.decisionBriefPreference === "enabled" ||
        user.decisionBriefPreference === "disabled" ||
        user.decisionBriefPreference === "inherit"
          ? user.decisionBriefPreference
          : undefined,
      digestEmailLookbackDays:
        typeof user.digestEmailLookbackDays === "number" && Number.isFinite(user.digestEmailLookbackDays)
          ? clampDigestEmailLookbackDays(user.digestEmailLookbackDays)
          : undefined,
    };
  },
});

/** Server-only: preferences for intended digest recipients (scan pipeline). */
export const getDecisionBriefPreferencesForUsersFromServer = query({
  args: { secret: v.string(), userIds: v.array(v.id("users")) },
  returns: v.array(
    v.object({
      userId: v.id("users"),
      decisionBriefPreference: v.optional(decisionBriefPreferenceValidator),
    }),
  ),
  handler: async (ctx, { secret, userIds }) => {
    if (!checkScanSecret(secret)) return [];
    const uniqueIds = [...new Set(userIds)];
    const rows = await Promise.all(uniqueIds.map((id) => ctx.db.get(id)));
    return rows
      .filter((row): row is NonNullable<typeof row> => row != null)
      .map((row) => ({
        userId: row._id,
        decisionBriefPreference:
          row.decisionBriefPreference === "enabled" ||
          row.decisionBriefPreference === "disabled" ||
          row.decisionBriefPreference === "inherit"
            ? row.decisionBriefPreference
            : undefined,
      }));
  },
});

export const getDecisionBriefPreference = query({
  args: {},
  returns: v.object({
    preference: decisionBriefPreferenceValidator,
    systemDefaultEnabled: v.boolean(),
    effectiveEnabled: v.boolean(),
  }),
  handler: async (ctx) => {
    const userId = await getUserIdFromIdentity(ctx);
    const systemDefaultEnabled = isDecisionBriefEnabledByDefault(process.env.DECISION_DIGEST_ENABLED);
    if (!userId) {
      return {
        preference: "inherit" as const,
        systemDefaultEnabled,
        effectiveEnabled: systemDefaultEnabled,
      };
    }
    const user = await ctx.db.get(userId);
    const preference: DecisionBriefPreference =
      user?.decisionBriefPreference === "enabled" ||
      user?.decisionBriefPreference === "disabled" ||
      user?.decisionBriefPreference === "inherit"
        ? user.decisionBriefPreference
        : "inherit";
    return {
      preference,
      systemDefaultEnabled,
      effectiveEnabled: resolveDecisionBriefEnabled(preference, systemDefaultEnabled),
    };
  },
});

export const setDecisionBriefPreference = mutation({
  args: { preference: decisionBriefPreferenceValidator },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, { preference }) => {
    const userId = await getOrCreateUserId(ctx);
    await ctx.db.patch(userId, {
      decisionBriefPreference: preference,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const setDigestEmailLookbackDays = mutation({
  args: { days: v.number() },
  returns: v.object({ ok: v.literal(true), days: v.number() }),
  handler: async (ctx, { days }) => {
    const userId = await getOrCreateUserId(ctx);
    const clamped = clampDigestEmailLookbackDays(days);
    await ctx.db.patch(userId, {
      digestEmailLookbackDays: clamped,
      updatedAt: Date.now(),
    });
    return { ok: true as const, days: clamped };
  },
});
