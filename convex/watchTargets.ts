import { v } from "convex/values";
import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("watchTargets")
      .withIndex("by_active", (q) => q.eq("active", true))
      .order("desc")
      .collect();
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("watchTargets").order("desc").collect();
  },
});

export const get = query({
  args: { id: v.id("watchTargets") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const getByIds = query({
  args: { ids: v.array(v.id("watchTargets")) },
  handler: async (ctx, { ids }) => {
    const results = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return results.filter((doc) => doc != null);
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
    const now = Date.now();
    return await ctx.db.insert("watchTargets", {
      ...args,
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
    await ctx.db.patch(id, { ...rest, updatedAt: Date.now() });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("watchTargets") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { active: false, updatedAt: Date.now() });
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
