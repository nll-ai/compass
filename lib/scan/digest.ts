import type { Id } from "../../convex/_generated/dataModel";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { formatSourceDate } from "../source-utils";

export interface NewRawItem {
  _id: Id<"rawItems">;
  watchTargetId: Id<"watchTargets">;
  title: string;
  url: string;
  source: string;
  abstract?: string | null;
  fullText?: string | null;
  publishedAt?: number | null;
  metadata?: Record<string, unknown> | null;
}

const CATEGORIES = ["trial_update", "publication", "regulatory", "filing", "news", "conference"] as const;
const SIGNIFICANCES = ["critical", "high", "medium", "low"] as const;

type Category = (typeof CATEGORIES)[number];
type Significance = (typeof SIGNIFICANCES)[number];

/** Normalize for comparing headline vs synthesis (avoid showing same text twice). */
function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** True if synthesis is effectively the same as headline (capitalization/minor rephrase only). */
function synthesisEquivalentToHeadline(headline: string, synthesis: string): boolean {
  const h = normalizeForCompare(headline);
  const t = normalizeForCompare(synthesis);
  if (h === t) return true;
  if (h.length < 10 || t.length < 10) return false;
  const hWords = new Set(h.split(/\s+/).filter(Boolean));
  const tWords = new Set(t.split(/\s+/).filter(Boolean));
  const overlap = [...hWords].filter((w) => tWords.has(w)).length;
  const unionSize = new Set([...hWords, ...tWords]).size;
  if (unionSize === 0) return false;
  const jaccard = overlap / unionSize;
  if (jaccard >= 0.85) return true;
  const shorter = h.length <= t.length ? h : t;
  const longer = h.length <= t.length ? t : h;
  if (longer.includes(shorter) && longer.length - shorter.length < 50) return true;
  return false;
}

/** Infer digest category from raw item source. One summary per source. */
function categoryForSource(source: string): Category {
  const m: Record<string, Category> = {
    edgar: "filing",
    pubmed: "publication",
    clinicaltrials: "trial_update",
    exa: "news",
    openfda: "regulatory",
    rss: "news",
    patents: "publication",
  };
  return m[source] ?? "news";
}

export interface DigestItemPayload {
  watchTargetId: Id<"watchTargets">;
  rawItemIds: Id<"rawItems">[];
  category: Category;
  significance: Significance;
  headline: string;
  synthesis: string;
  strategicImplication?: string;
  sources: Array<{ title: string; url: string; source: string; date?: string }>;
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
  good: Array<{
    watchTargetId: string;
    headline: string;
    synthesis: string;
    rawSnippets?: Array<{ title: string; abstractSnippet: string }>;
  }>;
  bad: Array<{
    watchTargetId: string;
    headline: string;
    synthesis: string;
    rawSnippets?: Array<{ title: string; abstractSnippet: string }>;
  }>;
}

/** Target info for the digest prompt (id, displayName, type, therapeuticArea, indication, notes). */
export interface DigestTargetInfo {
  _id: Id<"watchTargets">;
  displayName: string;
  type?: string;
  therapeuticArea?: string;
  indication?: string;
  notes?: string;
}

const CONTENT_MAX_CHARS = 1800;
const SOURCES_CONTEXT_LIMIT = 50;

const DIGEST_SYSTEM_PROMPT = `You are a competitive intelligence analyst specializing in biopharmaceuticals.

Your role is to synthesize raw intelligence data into actionable digests for a small biotech leadership team. Output will be read by time-constrained executives who need signal, not noise.

Formatting rules:
- Headlines: Lead with the event, not the company. "Phase 2 trial of X enrolls first patient" not "Company announces milestone for X".
- Synthesis: Stick to facts. Use numbers when available. Don't hedge or editorialize.
- Strategic implications: Only write when you can say something genuinely specific; otherwise omit or null. Generic statements like "this may affect strategy" are not acceptable.
- Significance: critical = program termination, major regulatory decision, Phase 3 failure, class-defining result; high = new trial, Phase 2/3 initiation, key publication, FDA designation; medium = interim data, protocol amendment, analyst report; low = routine update, review article, minor mention.`;

const digestItemAISchema = z.object({
  headline: z.string().max(200).describe("One crisp line. Lead with the change, not the company."),
  synthesis: z.string().describe("2–4 sentences. What happened, what the data shows, what's notable."),
  significance: z.enum(["critical", "high", "medium", "low"]),
  category: z.enum(["trial_update", "publication", "regulatory", "filing", "news", "conference"]),
  strategicImplication: z.string().nullable().describe("1–2 sentences only if genuinely specific; null otherwise."),
  sourceIndices: z.array(z.number()).describe("Indices into the sources array that this digest item summarizes."),
});

const digestAISchema = z.object({
  executiveSummary: z.string().describe("2–3 sentences. Total signals found, most important 1–2 developments, overall pulse."),
  items: z.array(digestItemAISchema),
});

/**
 * Generate digest using an LLM: executive summary + per-signal items from sourcesContext.
 * Uses watch target notes ("What are you looking to monitor?") in the user prompt.
 * Falls back to rule-based generateDigest when openaiKey is missing or LLM fails.
 */
export async function generateDigestWithAI(
  newItems: NewRawItem[],
  period: "daily" | "weekly",
  targets: DigestTargetInfo[],
  openaiKey: string | undefined,
  _feedbackContext?: FeedbackContext
): Promise<DigestPayload> {
  const targetIdToIndex = new Map<Id<"watchTargets">, number>(targets.map((t, i) => [t._id, i]));
  const targetNames = new Map<Id<"watchTargets">, string>(targets.map((t) => [t._id, t.displayName]));

  if (!openaiKey || newItems.length === 0) {
    return generateDigest(newItems, period, targetNames, openaiKey, _feedbackContext);
  }

  const limited = newItems.slice(0, SOURCES_CONTEXT_LIMIT);
  const sourcesContext = limited.map((item, i) => {
    const content = (item.abstract ?? item.fullText ?? item.title ?? "").trim() || item.title;
    const truncated = content.length > CONTENT_MAX_CHARS ? content.slice(0, CONTENT_MAX_CHARS) + "…" : content;
    const targetDisplay = targets[targetIdToIndex.get(item.watchTargetId) ?? 0]?.displayName ?? "Unknown";
    return {
      index: i,
      source: item.source,
      target: targetDisplay,
      title: item.title,
      url: item.url,
      content: truncated,
      publishedAt: item.publishedAt ? new Date(item.publishedAt).toISOString() : null,
      metadata: item.metadata,
    };
  });

  const targetsBlock = targets
    .map(
      (t) =>
        `- ${t.displayName} (${t.type ?? "—"}, ${t.therapeuticArea ?? "—"}${t.indication ? `, ${t.indication}` : ""})${t.notes?.trim() ? `\n    What to monitor: ${t.notes.trim()}` : ""}`
    )
    .join("\n");

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: digestAISchema,
      system: DIGEST_SYSTEM_PROMPT,
      prompt: `Today's date: ${new Date().toISOString().split("T")[0]}

Active watch targets (with optional "What to monitor" when set):
${targetsBlock}

New items to synthesize (${limited.length} total). Each has index, source, target, title, url, content, publishedAt. Group related items into single digest entries when they cover the same event. Rank by significance. Be concise — no filler.

${JSON.stringify(sourcesContext, null, 2)}`,
    });

    const items: DigestItemPayload[] = [];
    for (const aiItem of object.items) {
      const indices = aiItem.sourceIndices.filter((i) => i >= 0 && i < limited.length);
      if (indices.length === 0) continue;
      const firstItem = limited[indices[0]!];
      const rawItemIds = indices.map((i) => limited[i]!._id);
      items.push({
        watchTargetId: firstItem.watchTargetId,
        rawItemIds,
        category: aiItem.category as Category,
        significance: aiItem.significance as Significance,
        headline: aiItem.headline,
        synthesis: aiItem.synthesis,
        strategicImplication: aiItem.strategicImplication ?? undefined,
        sources: indices.map((i) => {
          const it = limited[i]!;
          return {
            title: it.title,
            url: it.url,
            source: it.source,
            date: formatSourceDate(it.source, it.publishedAt, it.metadata),
          };
        }),
      });
    }

    const criticalCount = items.filter((i) => i.significance === "critical").length;
    const highCount = items.filter((i) => i.significance === "high").length;
    const mediumCount = items.filter((i) => i.significance === "medium").length;
    const lowCount = items.filter((i) => i.significance === "low").length;

    return {
      executiveSummary: object.executiveSummary,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      items,
    };
  } catch {
    return generateDigest(newItems, period, targetNames, openaiKey, _feedbackContext);
  }
}

export async function generateDigest(
  newItems: NewRawItem[],
  _period: "daily" | "weekly",
  _targetNames: Map<Id<"watchTargets">, string>,
  _openaiKey: string | undefined,
  _feedbackContext?: FeedbackContext
): Promise<DigestPayload> {
  // One signal per source: one digest item per raw item, using each item's title and abstract (main point).
  const limit = 50;
  const items: DigestItemPayload[] = newItems.slice(0, limit).map((item) => {
    const headline = item.title;
    const rawSynthesis = (item.abstract ?? item.fullText ?? item.title ?? "").trim() || item.title;
    const synthesis =
      synthesisEquivalentToHeadline(headline, rawSynthesis) ? "No additional summary available." : rawSynthesis;
    return {
      watchTargetId: item.watchTargetId,
      rawItemIds: [item._id],
      category: categoryForSource(item.source),
      significance: "medium" as Significance,
      headline,
      synthesis,
      strategicImplication: undefined,
      sources: [
        {
          title: item.title,
          url: item.url,
          source: item.source,
          date: formatSourceDate(item.source, item.publishedAt, item.metadata),
        },
      ],
    };
  });

  const lowCount = items.length;
  const executiveSummary =
    items.length === 0
      ? "No new sources this period."
      : `${items.length} new source${items.length === 1 ? "" : "s"} this period.`;

  return {
    executiveSummary,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount,
    items,
  };
}
