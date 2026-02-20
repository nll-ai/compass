import type { Id } from "../../convex/_generated/dataModel";

export interface NewRawItem {
  _id: Id<"rawItems">;
  watchTargetId: Id<"watchTargets">;
  title: string;
  url: string;
  source: string;
  abstract?: string | null;
  fullText?: string | null;
}

const CATEGORIES = ["trial_update", "publication", "regulatory", "filing", "news", "conference"] as const;
const SIGNIFICANCES = ["critical", "high", "medium", "low"] as const;

type Category = (typeof CATEGORIES)[number];
type Significance = (typeof SIGNIFICANCES)[number];

export interface DigestItemPayload {
  watchTargetId: Id<"watchTargets">;
  rawItemIds: Id<"rawItems">[];
  category: Category;
  significance: Significance;
  headline: string;
  synthesis: string;
  strategicImplication?: string;
  sources: Array<{ title: string; url: string; source: string }>;
}

export interface DigestPayload {
  executiveSummary: string;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  items: DigestItemPayload[];
}

/** User feedback from past digest items, used to tune the prompt. */
export interface FeedbackContext {
  good: Array<{ headline: string; synthesis: string }>;
  bad: Array<{ headline: string; synthesis: string }>;
}

function isCategory(c: string): c is Category {
  return CATEGORIES.includes(c as Category);
}
function isSignificance(s: string): s is Significance {
  return SIGNIFICANCES.includes(s as Significance);
}

export async function generateDigest(
  newItems: NewRawItem[],
  period: "daily" | "weekly",
  targetNames: Map<Id<"watchTargets">, string>,
  openaiKey: string | undefined,
  feedbackContext?: FeedbackContext
): Promise<DigestPayload> {
  const targetMap = new Map<string, Id<"watchTargets">>();
  targetNames.forEach((name, id) => targetMap.set(name, id));

  const sourcesContext = newItems.map((item, i) => {
    const targetName = targetNames.get(item.watchTargetId) ?? "Unknown";
    return {
      index: i,
      source: item.source,
      targetName,
      title: item.title,
      url: item.url,
      content: (item.abstract ?? item.fullText ?? item.title ?? "").slice(0, 800),
    };
  });

  if (!openaiKey) {
    return {
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
    };
  }

  const good = feedbackContext?.good ?? [];
  const bad = feedbackContext?.bad ?? [];
  const hasFeedback = good.length > 0 || bad.length > 0;
  const feedbackBlock = hasFeedback
    ? `

Learn from user feedback. Users marked these digest items as RELEVANT (emulate this style and relevance):
${good.slice(0, 10).map((g) => `- "${g.headline}" / ${(g.synthesis ?? "").slice(0, 120)}...`).join("\n")}

Users marked these as NOT RELEVANT (avoid similar; e.g. wrong therapeutic context, plant/agricultural when human/cardio/oncology is intended, or noise):
${bad.slice(0, 10).map((b) => `- "${b.headline}" / ${(b.synthesis ?? "").slice(0, 120)}...`).join("\n")}
`
      : "";

  const prompt = `You are a competitive intelligence analyst for biopharma. Given the following new items from a scan, produce a structured digest.${feedbackBlock}

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

  const items: DigestItemPayload[] = [];

  for (const it of rawItems.slice(0, 20)) {
    const targetName = it.targetName ?? "";
    const watchTargetId = targetMap.get(targetName) ?? newItems[0]?.watchTargetId;
    if (!watchTargetId) continue;
    const indices = it.sourceIndices ?? [];
    const rawItemIds = indices.map((i) => newItems[i]?._id).filter(Boolean) as Id<"rawItems">[];
    if (rawItemIds.length === 0) continue;
    const sources = indices
      .map((i) => {
        const r = newItems[i];
        return r ? { title: r.title, url: r.url, source: r.source } : { title: "", url: "", source: "" };
      })
      .filter((s) => s.title);

    const category: Category = isCategory(it.category ?? "news") ? (it.category as Category) : "news";
    const sig: Significance = isSignificance(it.significance ?? "low") ? (it.significance as Significance) : "low";
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

  return {
    executiveSummary,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    items,
  };
}
