import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

export const listByDigestRun = query({
  args: { digestRunId: v.id("digestRuns") },
  handler: async (ctx, { digestRunId }) => {
    return await ctx.db
      .query("digestItems")
      .withIndex("by_digestRun", (q) => q.eq("digestRunId", digestRunId))
      .collect();
  },
});

/** List signals (digest items) for a watch target across all digest runs, newest first. */
export const listByWatchTarget = query({
  args: { watchTargetId: v.id("watchTargets"), limit: v.optional(v.number()) },
  handler: async (ctx, { watchTargetId, limit = 60 }) => {
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

const ABSTRACT_SNIPPET_LEN = 300;

/** Returns recent user feedback for digest prompt tuning: good/bad with watchTargetId and raw snippets. */
export const getFeedbackForPrompt = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 40 }) => {
    const all = await ctx.db.query("digestItems").collect();
    const withFeedback = all.filter((d) => d.feedback != null);
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
