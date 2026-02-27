import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { getOrCreateUserId, getUserIdFromIdentity } from "./lib/auth";

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("watchTargets")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("active"), true))
      .order("desc")
      .collect();
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("watchTargets")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("watchTargets") },
  handler: async (ctx, { id }) => {
    const doc = await ctx.db.get(id);
    if (!doc) return null;
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId || doc.userId !== userId) return null;
    return doc;
  },
});

export const getByIds = query({
  args: { ids: v.array(v.id("watchTargets")) },
  handler: async (ctx, { ids }) => {
    const userId = await getUserIdFromIdentity(ctx);
    if (!userId) return [];
    const results = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return results.filter(
      (doc): doc is NonNullable<typeof doc> =>
        doc != null && doc.userId === userId,
    );
  },
});

/** Internal: get watch targets by ids (no auth). Used by digest pipeline. */
export const getByIdsInternal = internalQuery({
  args: { ids: v.array(v.id("watchTargets")) },
  handler: async (ctx, { ids }) => {
    const results = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return results.filter((doc): doc is NonNullable<typeof doc> => doc != null);
  },
});

function checkScanSecret(secret: string): boolean {
  return (
    typeof process.env.SCAN_SECRET === "string" &&
    process.env.SCAN_SECRET.length > 0 &&
    secret === process.env.SCAN_SECRET
  );
}

/** Server-only: get watch targets by ids using scan secret. Used by POST /api/scan. */
export const getByIdsForServer = query({
  args: {
    secret: v.string(),
    ids: v.array(v.id("watchTargets")),
  },
  handler: async (ctx, { secret, ids }) => {
    if (!checkScanSecret(secret)) return [];
    const results = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return results.filter((doc): doc is NonNullable<typeof doc> => doc != null);
  },
});

/** Server-only: list active watch targets using scan secret. Used by POST /api/scan when no targetIds. */
export const listActiveForServer = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    if (!checkScanSecret(secret)) return [];
    return await ctx.db
      .query("watchTargets")
      .filter((q) => q.eq(q.field("active"), true))
      .order("desc")
      .collect();
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
    const userId = await getOrCreateUserId(ctx);
    const now = Date.now();
    return await ctx.db.insert("watchTargets", {
      ...args,
      userId,
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
    const userId = await getOrCreateUserId(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== userId) throw new Error("Unauthorized");
    await ctx.db.patch(id, { ...rest, updatedAt: Date.now() });
    return id;
  },
});

/** Permanently delete a watch target and all associated records (digest items, raw items, per-target schedule). */
export const remove = mutation({
  args: { id: v.id("watchTargets") },
  handler: async (ctx, { id }) => {
    const userId = await getOrCreateUserId(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== userId) throw new Error("Unauthorized");
    const digestItems = await ctx.db
      .query("digestItems")
      .withIndex("by_watchTarget", (q) => q.eq("watchTargetId", id))
      .collect();
    for (const row of digestItems) await ctx.db.delete(row._id);

    const rawItems = await ctx.db
      .query("rawItems")
      .withIndex("by_watchTarget", (q) => q.eq("watchTargetId", id))
      .collect();
    for (const row of rawItems) await ctx.db.delete(row._id);

    const schedule = await ctx.db
      .query("watchTargetSchedule")
      .withIndex("by_watchTarget", (q) => q.eq("watchTargetId", id))
      .first();
    if (schedule) await ctx.db.delete(schedule._id);

    await ctx.db.delete(id);
    return id;
  },
});

/** Called by backend only: set learned query terms derived from user feedback. */
export const setLearnedTerms = internalMutation({
  args: {
    watchTargetId: v.id("watchTargets"),
    learnedQueryTerms: v.array(v.string()),
    excludeQueryTerms: v.array(v.string()),
  },
  handler: async (ctx, { watchTargetId, learnedQueryTerms, excludeQueryTerms }) => {
    const now = Date.now();
    await ctx.db.patch(watchTargetId, {
      learnedQueryTerms,
      excludeQueryTerms,
      learnedTermsUpdatedAt: now,
      updatedAt: now,
    });
    return watchTargetId;
  },
});

const MIN_GOOD_OR_BAD = 2;

/** Derive search terms from feedback for one watch target and store them. Uses OpenAI. */
export const refreshLearnedTermsForTarget = internalAction({
  args: { watchTargetId: v.id("watchTargets") },
  handler: async (ctx, { watchTargetId }) => {
    const { good, bad } = await ctx.runQuery(api.digestItems.getFeedbackWithRawContent, {
      watchTargetId,
      limit: 30,
    });
    if (good.length < MIN_GOOD_OR_BAD && bad.length < MIN_GOOD_OR_BAD) {
      return { updated: false, reason: "insufficient_feedback" };
    }

    const target = await ctx.runQuery(api.watchTargets.get, { id: watchTargetId });
    const displayName = target?.displayName ?? "this target";

    const goodBlock =
      good.length > 0
        ? `RELEVANT (users marked these as good):\n${good
            .map(
              (g) =>
                `- "${g.headline}" / ${g.synthesis.slice(0, 120)}...\n  Source: ${g.rawSnippets.map((s) => `${s.title} | ${s.abstractSnippet}`).join("; ")}`
            )
            .join("\n")}`
        : "";
    const badBlock =
      bad.length > 0
        ? `NOT RELEVANT (users marked these as bad):\n${bad
            .map(
              (b) =>
                `- "${b.headline}" / ${b.synthesis.slice(0, 120)}...\n  Source: ${b.rawSnippets.map((s) => `${s.title} | ${s.abstractSnippet}`).join("; ")}`
            )
            .join("\n")}`
        : "";

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return { updated: false, reason: "no_openai_key" };
    }

    const prompt = `You are a search query analyst for biopharma competitive intelligence. For watch target "${displayName}", we have user feedback on which retrieved items were relevant or not.

${goodBlock}
${badBlock}

From this feedback, derive search terms to improve future retrieval.
Return a JSON object only: { "addTerms": string[], "excludeTerms": string[] }
- addTerms: 5-10 phrases or keywords to ADD to search queries (e.g. "NPR1 agonist", "heart failure", "phase 2 trial"). Use phrases that appear in or summarize the RELEVANT content.
- excludeTerms: 3-5 terms to EXCLUDE when they would pull in noise (e.g. "rice", "arabidopsis", "plant"). Use terms that appear in NOT RELEVANT content or that would filter it out.
Keep phrases short and suitable for appending to PubMed/Exa-style queries.`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI: ${res.status} ${err}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { addTerms?: string[]; excludeTerms?: string[] };
    const learnedQueryTerms = Array.isArray(parsed.addTerms) ? parsed.addTerms.slice(0, 10) : [];
    const excludeQueryTerms = Array.isArray(parsed.excludeTerms) ? parsed.excludeTerms.slice(0, 5) : [];

    await ctx.runMutation(internal.watchTargets.setLearnedTerms, {
      watchTargetId,
      learnedQueryTerms,
      excludeQueryTerms,
    });
    return { updated: true, learnedQueryTerms, excludeQueryTerms };
  },
});
