import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  getOrCreateUserId,
  getUserIdFromIdentity,
  userOwnsDigestRun,
  canViewWatchTarget,
} from "./lib/auth";
import { isEligibleDigestAssignee } from "./lib/digestWorkflowAssignee";
import type { Id } from "./_generated/dataModel";

const COMMENT_BODY_MAX = 4000;

function checkScanSecret(secret: string): boolean {
  return (
    typeof process.env.SCAN_SECRET === "string" &&
    process.env.SCAN_SECRET.length > 0 &&
    secret === process.env.SCAN_SECRET
  );
}

/** True if assignee may be set on this target (owner or same team as target). */
async function isValidAssigneeForTarget(
  ctx: MutationCtx,
  watchTargetId: Id<"watchTargets">,
  assigneeUserId: Id<"users">,
): Promise<boolean> {
  const target = await ctx.db.get(watchTargetId);
  if (!target) return false;
  const assignee = await ctx.db.get(assigneeUserId);
  if (!assignee) return false;
  return isEligibleDigestAssignee({
    targetOwnerUserId: target.userId ?? "",
    targetTeamId: target.teamId,
    assigneeUserId,
    assigneeTeamId: assignee.teamId,
  });
}

export const listByDigestRun = query({
  args: { digestRunId: v.id("digestRuns") },
  handler: async (ctx, { digestRunId }) => {
    if (!(await userOwnsDigestRun(ctx, digestRunId))) return [];
    return await ctx.db
      .query("digestItems")
      .withIndex("by_digestRun", (q) => q.eq("digestRunId", digestRunId))
      .collect();
  },
});

/** Server-only: digest items for a run (decision-digest backfill). */
export const listByDigestRunFromServer = query({
  args: { secret: v.string(), digestRunId: v.id("digestRuns") },
  handler: async (ctx, { secret, digestRunId }) => {
    if (!checkScanSecret(secret)) return [];
    return await ctx.db
      .query("digestItems")
      .withIndex("by_digestRun", (q) => q.eq("digestRunId", digestRunId))
      .collect();
  },
});

/** Internal: all digest items for a run (email assembly). */
export const listByDigestRunInternal = internalQuery({
  args: { digestRunId: v.id("digestRuns") },
  handler: async (ctx, { digestRunId }) => {
    return await ctx.db
      .query("digestItems")
      .withIndex("by_digestRun", (q) => q.eq("digestRunId", digestRunId))
      .collect();
  },
});

/** List signals (digest items) for a watch target across all digest runs, newest first. Caller must be able to view the target (`canViewWatchTarget`). */
export const listByWatchTarget = query({
  args: { watchTargetId: v.id("watchTargets"), limit: v.optional(v.number()) },
  handler: async (ctx, { watchTargetId, limit = 60 }) => {
    if (!(await canViewWatchTarget(ctx, watchTargetId))) return [];
    const items = await ctx.db
      .query("digestItems")
      .withIndex("by_watchTarget", (q) => q.eq("watchTargetId", watchTargetId))
      .take(limit * 2);
    const withRun = await Promise.all(
      items.map(async (item) => {
        const run = await ctx.db.get(item.digestRunId);
        return { item, generatedAt: run?.generatedAt ?? 0 };
      })
    );
    withRun.sort((a, b) => b.generatedAt - a.generatedAt);
    return withRun.slice(0, limit).map(({ item }) => item);
  },
});

const LEARNED_TERMS_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export const setFeedback = mutation({
  args: {
    digestItemId: v.id("digestItems"),
    feedback: v.union(v.literal("good"), v.literal("bad")),
  },
  handler: async (ctx, { digestItemId, feedback }) => {
    const item = await ctx.db.get(digestItemId);
    if (!item) throw new Error("Not found");
    const userId = await getOrCreateUserId(ctx);
    if (!(await canViewWatchTarget(ctx, item.watchTargetId))) throw new Error("Unauthorized");
    const now = Date.now();
    await ctx.db.patch(digestItemId, { feedback, feedbackAt: now });
    if (item) {
      const target = await ctx.db.get(item.watchTargetId);
      const lastUpdated = target?.learnedTermsUpdatedAt ?? 0;
      if (now - lastUpdated >= LEARNED_TERMS_COOLDOWN_MS) {
        ctx.scheduler.runAfter(0, internal.watchTargets.refreshLearnedTermsForTarget, {
          watchTargetId: item.watchTargetId,
        });
      }
    }
    return digestItemId;
  },
});

const workflowStatusValidator = v.union(
  v.literal("open"),
  v.literal("in_review"),
  v.literal("resolved"),
);

export const setWorkflowStatus = mutation({
  args: {
    digestItemId: v.id("digestItems"),
    workflowStatus: workflowStatusValidator,
  },
  handler: async (ctx, { digestItemId, workflowStatus }) => {
    const item = await ctx.db.get(digestItemId);
    if (!item) throw new Error("Not found");
    await getOrCreateUserId(ctx);
    if (!(await canViewWatchTarget(ctx, item.watchTargetId))) throw new Error("Unauthorized");
    const now = Date.now();
    await ctx.db.patch(digestItemId, {
      workflowStatus,
      workflowUpdatedAt: now,
    });
    return digestItemId;
  },
});

export const setAssignee = mutation({
  args: {
    digestItemId: v.id("digestItems"),
    assigneeUserId: v.union(v.id("users"), v.null()),
  },
  handler: async (ctx, { digestItemId, assigneeUserId }) => {
    const item = await ctx.db.get(digestItemId);
    if (!item) throw new Error("Not found");
    await getOrCreateUserId(ctx);
    if (!(await canViewWatchTarget(ctx, item.watchTargetId))) throw new Error("Unauthorized");
    if (assigneeUserId != null && !(await isValidAssigneeForTarget(ctx, item.watchTargetId, assigneeUserId))) {
      throw new Error("Invalid assignee for this watch target");
    }
    const now = Date.now();
    await ctx.db.patch(digestItemId, {
      assigneeUserId: assigneeUserId ?? undefined,
      workflowUpdatedAt: now,
    });
    return digestItemId;
  },
});

export const addComment = mutation({
  args: {
    digestItemId: v.id("digestItems"),
    body: v.string(),
  },
  handler: async (ctx, { digestItemId, body }) => {
    const item = await ctx.db.get(digestItemId);
    if (!item) throw new Error("Not found");
    const authorUserId = await getOrCreateUserId(ctx);
    if (!(await canViewWatchTarget(ctx, item.watchTargetId))) throw new Error("Unauthorized");
    const trimmed = body.trim();
    if (!trimmed) throw new Error("Comment cannot be empty");
    if (trimmed.length > COMMENT_BODY_MAX) throw new Error("Comment too long");
    const createdAt = Date.now();
    const id = await ctx.db.insert("digestItemComments", {
      digestItemId,
      authorUserId,
      body: trimmed,
      createdAt,
    });
    await ctx.db.patch(digestItemId, { workflowUpdatedAt: createdAt });
    return id;
  },
});

export const listComments = query({
  args: { digestItemId: v.id("digestItems") },
  handler: async (ctx, { digestItemId }) => {
    const item = await ctx.db.get(digestItemId);
    if (!item) return [];
    if (!(await canViewWatchTarget(ctx, item.watchTargetId))) return [];
    const rows = await ctx.db
      .query("digestItemComments")
      .withIndex("by_digestItem", (q) => q.eq("digestItemId", digestItemId))
      .collect();
    rows.sort((a, b) => a.createdAt - b.createdAt);
    const withEmail = await Promise.all(
      rows.map(async (row) => {
        const author = await ctx.db.get(row.authorUserId);
        return {
          _id: row._id,
          body: row.body,
          createdAt: row.createdAt,
          authorUserId: row.authorUserId,
          authorEmail: author?.email ?? "",
        };
      }),
    );
    return withEmail;
  },
});

const ABSTRACT_SNIPPET_LEN = 300;

/** Returns recent user feedback for digest prompt tuning: good/bad with watchTargetId and raw snippets. Scoped to current user's targets. */
export const getFeedbackForPrompt = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 40 }) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return { good: [], bad: [] };
    const userTargets = await ctx.db
      .query("watchTargets")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const userTargetIdSet = new Set(userTargets.map((t) => t._id));
    const all = await ctx.db.query("digestItems").collect();
    const withFeedback = all.filter(
      (d) => d.feedback != null && userTargetIdSet.has(d.watchTargetId),
    );
    withFeedback.sort((a, b) => (b.feedbackAt ?? 0) - (a.feedbackAt ?? 0));
    const recent = withFeedback.slice(0, limit);

    const toEntry = async (d: (typeof recent)[0]) => {
      const rawSnippets: Array<{ title: string; abstractSnippet: string }> = [];
      for (const rawId of d.rawItemIds) {
        const raw = await ctx.db.get(rawId);
        if (raw) {
          const abstractSnippet = (raw.abstract ?? raw.fullText ?? "").slice(0, ABSTRACT_SNIPPET_LEN);
          rawSnippets.push({ title: raw.title, abstractSnippet });
        }
      }
      return {
        watchTargetId: d.watchTargetId,
        headline: d.headline,
        synthesis: d.synthesis,
        rawSnippets,
      };
    };

    const good = await Promise.all(recent.filter((d) => d.feedback === "good").map(toEntry));
    const bad = await Promise.all(recent.filter((d) => d.feedback === "bad").map(toEntry));
    return { good, bad };
  },
});

/** Returns good/bad digest items with resolved raw item snippets for term derivation or digest prompt. */
export const getFeedbackWithRawContent = query({
  args: {
    watchTargetId: v.optional(v.id("watchTargets")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { watchTargetId, limit = 40 }) => {
    const all = await ctx.db.query("digestItems").collect();
    let withFeedback = all.filter((d) => d.feedback != null);
    if (watchTargetId !== undefined) {
      withFeedback = withFeedback.filter((d) => d.watchTargetId === watchTargetId);
    }
    withFeedback.sort((a, b) => (b.feedbackAt ?? 0) - (a.feedbackAt ?? 0));
    const recent = withFeedback.slice(0, limit);

    const toEntry = async (d: (typeof recent)[0]) => {
      const rawSnippets: Array<{ title: string; abstractSnippet: string }> = [];
      for (const rawId of d.rawItemIds) {
        const raw = await ctx.db.get(rawId);
        if (raw) {
          const abstractSnippet = (raw.abstract ?? raw.fullText ?? "").slice(0, ABSTRACT_SNIPPET_LEN);
          rawSnippets.push({ title: raw.title, abstractSnippet });
        }
      }
      return {
        watchTargetId: d.watchTargetId,
        headline: d.headline,
        synthesis: d.synthesis,
        rawSnippets,
      };
    };

    const good = await Promise.all(recent.filter((d) => d.feedback === "good").map(toEntry));
    const bad = await Promise.all(recent.filter((d) => d.feedback === "bad").map(toEntry));
    return { good, bad };
  },
});
