import type { Id } from "../../convex/_generated/dataModel";
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
