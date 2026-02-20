import { v } from "convex/values";
import { internalAction, internalMutation, mutation } from "./_generated/server";
import { api, internal } from "./_generated/api";

const categoryValidator = v.union(
  v.literal("trial_update"),
  v.literal("publication"),
  v.literal("regulatory"),
  v.literal("filing"),
  v.literal("news"),
  v.literal("conference"),
);
const significanceValidator = v.union(
  v.literal("critical"),
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
);

function checkDigestSecret(secret: string): boolean {
  return typeof process.env.SCAN_SECRET === "string" && process.env.SCAN_SECRET.length > 0 && secret === process.env.SCAN_SECRET;
}

export const createDigestRunWithItemsFromServer = mutation({
  args: {
    secret: v.string(),
    scanRunId: v.id("scanRuns"),
    period: v.union(v.literal("daily"), v.literal("weekly")),
    executiveSummary: v.string(),
    criticalCount: v.number(),
    highCount: v.number(),
    mediumCount: v.number(),
    lowCount: v.number(),
    items: v.array(
      v.object({
        watchTargetId: v.id("watchTargets"),
        rawItemIds: v.array(v.id("rawItems")),
        category: categoryValidator,
        significance: significanceValidator,
        headline: v.string(),
        synthesis: v.string(),
        strategicImplication: v.optional(v.string()),
        sources: v.array(v.object({ title: v.string(), url: v.string(), source: v.string() })),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (!checkDigestSecret(args.secret)) throw new Error("Unauthorized");
    const { secret: _s, ...rest } = args;
    const totalSignals = rest.items.length;
    const digestRunId = await ctx.db.insert("digestRuns", {
      scanRunId: rest.scanRunId,
      generatedAt: Date.now(),
      period: rest.period,
      executiveSummary: rest.executiveSummary,
      totalSignals,
      criticalCount: rest.criticalCount,
      highCount: rest.highCount,
      mediumCount: rest.mediumCount,
      lowCount: rest.lowCount,
      slackPosted: false,
    });
    for (const item of rest.items) {
      await ctx.db.insert("digestItems", {
        digestRunId,
        watchTargetId: item.watchTargetId,
        rawItemIds: item.rawItemIds,
        category: item.category,
        significance: item.significance,
        headline: item.headline,
        synthesis: item.synthesis,
        strategicImplication: item.strategicImplication,
        sources: item.sources,
      });
    }
    return digestRunId;
  },
});

export const createDigestRunWithItems = internalMutation({
  args: {
    scanRunId: v.id("scanRuns"),
    period: v.union(v.literal("daily"), v.literal("weekly")),
    executiveSummary: v.string(),
    criticalCount: v.number(),
    highCount: v.number(),
    mediumCount: v.number(),
    lowCount: v.number(),
    items: v.array(
      v.object({
        watchTargetId: v.id("watchTargets"),
        rawItemIds: v.array(v.id("rawItems")),
        category: categoryValidator,
        significance: significanceValidator,
        headline: v.string(),
        synthesis: v.string(),
        strategicImplication: v.optional(v.string()),
        sources: v.array(v.object({ title: v.string(), url: v.string(), source: v.string() })),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const totalSignals = args.items.length;
    const digestRunId = await ctx.db.insert("digestRuns", {
      scanRunId: args.scanRunId,
      generatedAt: Date.now(),
      period: args.period,
      executiveSummary: args.executiveSummary,
      totalSignals,
      criticalCount: args.criticalCount,
      highCount: args.highCount,
      mediumCount: args.mediumCount,
      lowCount: args.lowCount,
      slackPosted: false,
    });
    for (const item of args.items) {
      await ctx.db.insert("digestItems", {
        digestRunId,
        watchTargetId: item.watchTargetId,
        rawItemIds: item.rawItemIds,
        category: item.category,
        significance: item.significance,
        headline: item.headline,
        synthesis: item.synthesis,
        strategicImplication: item.strategicImplication,
        sources: item.sources,
      });
    }
    return digestRunId;
  },
});

export const generate = internalAction({
  args: { scanRunId: v.id("scanRuns") },
  handler: async (ctx, { scanRunId }) => {
    const [newItems, targets, scan] = await Promise.all([
      ctx.runQuery(internal.rawItems.getNewByScanRun, { scanRunId }),
      ctx.runQuery(api.watchTargets.listActive, {}),
      ctx.runQuery(api.scans.get, { id: scanRunId }),
    ]);
    if (newItems.length === 0 && scan?.period !== "weekly") return;
    const period = scan?.period ?? "daily";

    const targetMap = new Map(targets.map((t) => [t.name, t._id]));
    const targetNames = new Map(targets.map((t) => [t._id, t.displayName]));

    const sourcesContext = newItems.map((item, i) => {
      const targetName = targetNames.get(item.watchTargetId) ?? "Unknown";
      return {
        index: i,
        source: item.source,
        targetName,
        title: item.title,
        url: item.url,
        content: (item.abstract ?? item.fullText ?? item.title).slice(0, 800),
      };
    });

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      await ctx.runMutation(internal.digests.createDigestRunWithItems, {
        scanRunId,
        period,
        executiveSummary: "Digest generated without LLM (no OPENAI_API_KEY).",
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: newItems.length,
        items: newItems.slice(0, 20).map((item) => ({
          watchTargetId: item.watchTargetId,
          rawItemIds: [item._id],
          category: "news" as const,
          significance: "low" as const,
          headline: item.title,
          synthesis: item.abstract ?? item.title,
          strategicImplication: undefined,
          sources: [{ title: item.title, url: item.url, source: item.source }],
        })),
      });
      return;
    }

    const prompt = `You are a competitive intelligence analyst for biopharma. Given the following new items from a scan, produce a structured digest.

Today's date: ${new Date().toISOString().split("T")[0]}
Period: ${period}

New items (index, source, target, title, content):
${JSON.stringify(sourcesContext, null, 2)}

Respond with a JSON object only, no markdown:
{
  "executiveSummary": "2-3 sentences. Total signals and the 1-2 most important developments.",
  "items": [
    {
      "targetName": "exact target display name from the items above",
      "category": "trial_update|publication|regulatory|filing|news|conference",
      "significance": "critical|high|medium|low",
      "headline": "One crisp line, lead with the event",
      "synthesis": "2-4 sentences.",
      "strategicImplication": "1-2 sentences for Ormoni, or null",
      "sourceIndices": [0, 1]
    }
  ]
}

Limit to 20 items. Use sourceIndices to reference which of the new items (by index) this digest item is based on.`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
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
    const parsed = JSON.parse(content) as {
      executiveSummary?: string;
      items?: Array<{
        targetName?: string;
        category?: string;
        significance?: string;
        headline?: string;
        synthesis?: string;
        strategicImplication?: string | null;
        sourceIndices?: number[];
      }>;
    };

    const executiveSummary = parsed.executiveSummary ?? "No summary generated.";
    const rawItems = parsed.items ?? [];
    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;

    const items: Array<{
      watchTargetId: typeof newItems[0]["watchTargetId"];
      rawItemIds: typeof newItems[0]["_id"][];
      category: "trial_update" | "publication" | "regulatory" | "filing" | "news" | "conference";
      significance: "critical" | "high" | "medium" | "low";
      headline: string;
      synthesis: string;
      strategicImplication?: string;
      sources: Array<{ title: string; url: string; source: string }>;
    }> = [];

    const categoryOk = (c: string): c is "trial_update" | "publication" | "regulatory" | "filing" | "news" | "conference" =>
      ["trial_update", "publication", "regulatory", "filing", "news", "conference"].includes(c);
    const significanceOk = (s: string): s is "critical" | "high" | "medium" | "low" =>
      ["critical", "high", "medium", "low"].includes(s);

    for (const it of rawItems.slice(0, 20)) {
      const targetName = it.targetName ?? "";
      const watchTargetId = targetMap.get(targetName) ?? newItems[0]?.watchTargetId;
      if (!watchTargetId) continue;
      const indices = it.sourceIndices ?? [];
      const rawItemIds = indices.map((i) => newItems[i]?._id).filter(Boolean) as typeof newItems[0]["_id"][];
      if (rawItemIds.length === 0) continue;
      const sources = indices.map((i) => {
        const r = newItems[i];
        return r ? { title: r.title, url: r.url, source: r.source } : { title: "", url: "", source: "" };
      }).filter((s) => s.title);

      const category: "trial_update" | "publication" | "regulatory" | "filing" | "news" | "conference" = categoryOk(it.category ?? "news") ? (it.category as "trial_update" | "publication" | "regulatory" | "filing" | "news" | "conference") : "news";
      const sig: "critical" | "high" | "medium" | "low" = significanceOk(it.significance ?? "low") ? (it.significance as "critical" | "high" | "medium" | "low") : "low";
      if (sig === "critical") criticalCount++;
      else if (sig === "high") highCount++;
      else if (sig === "medium") mediumCount++;
      else lowCount++;

      items.push({
        watchTargetId,
        rawItemIds,
        category,
        significance: sig,
        headline: it.headline ?? "Update",
        synthesis: it.synthesis ?? "",
        strategicImplication: it.strategicImplication ?? undefined,
        sources,
      });
    }

    await ctx.runMutation(internal.digests.createDigestRunWithItems, {
      scanRunId,
      period,
      executiveSummary,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      items,
    });
  },
});
