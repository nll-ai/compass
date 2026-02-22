import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";

const SNIPPET_LEN = 200;

/**
 * Returns recent thumbs-up/thumbs-down feedback for the given watch targets,
 * from both digest items and source links. Used to inject "what was favored vs not"
 * into the scan mission so source agents can tune retrieval.
 */
export const getFeedbackForMission = query({
  args: {
    watchTargetIds: v.array(v.id("watchTargets")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { watchTargetIds, limit = 25 }) => {
    const targetSet = new Set(watchTargetIds);
    const digestGood: Array<{ watchTargetId: Id<"watchTargets">; headline: string; snippet: string }> = [];
    const digestBad: Array<{ watchTargetId: Id<"watchTargets">; headline: string; snippet: string }> = [];
    const sourceGood: Array<{ watchTargetId: Id<"watchTargets">; title: string; snippet: string }> = [];
    const sourceBad: Array<{ watchTargetId: Id<"watchTargets">; title: string; snippet: string }> = [];

    // Digest item feedback (has watchTargetId, headline, synthesis)
    const allDigestItems = await ctx.db.query("digestItems").collect();
    const withFeedback = allDigestItems.filter((d) => d.feedback != null && targetSet.has(d.watchTargetId));
    withFeedback.sort((a, b) => (b.feedbackAt ?? 0) - (a.feedbackAt ?? 0));
    const recentDigest = withFeedback.slice(0, limit);
    for (const d of recentDigest) {
      const snippet = (d.synthesis ?? d.headline ?? "").slice(0, SNIPPET_LEN);
      const entry = { watchTargetId: d.watchTargetId, headline: d.headline ?? "", snippet };
      if (d.feedback === "good") digestGood.push(entry);
      else digestBad.push(entry);
    }

    // Source link feedback: get recent by updatedAt, then resolve raw item for watchTargetId + title/snippet
    const allSourceFeedback = await ctx.db.query("sourceLinkFeedback").collect();
    allSourceFeedback.sort((a, b) => b.updatedAt - a.updatedAt);
    let sourceCount = 0;
    for (const row of allSourceFeedback) {
      if (sourceCount >= limit) break;
      const raw = await ctx.db.get(row.rawItemId);
      if (!raw || !targetSet.has(raw.watchTargetId)) continue;
      const snippet = (raw.abstract ?? raw.fullText ?? raw.title ?? "").slice(0, SNIPPET_LEN);
      const entry = { watchTargetId: raw.watchTargetId, title: raw.title ?? "", snippet };
      if (row.feedback === "good") sourceGood.push(entry);
      else sourceBad.push(entry);
      sourceCount++;
    }

    return {
      digestGood,
      digestBad,
      sourceGood,
      sourceBad,
    };
  },
});
