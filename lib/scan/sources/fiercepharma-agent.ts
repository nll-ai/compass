/**
 * FiercePharma source agent.
 *
 * Primary path (EXA_API_KEY set): domain-scoped Exa search — one `/search` per watch
 * target restricted to `includeDomains: ["fiercepharma.com"]`, `category: "news"`,
 * `startPublishedDate` derived from the scan's `lookbackDays` (server-side recency),
 * and `contents.text` so article body and `publishedDate` come back in one call.
 * This is genuine per-target archive search (not a fixed feed dump) and follows the
 * same pattern as every other source: a real retrieval backend with the shared
 * `filterRelevantItems` LLM precision pass applied downstream.
 *
 * Fallback path (no EXA_API_KEY): fetch the single global FiercePharma RSS feed and
 * keyword-match title/description to watch targets. FiercePharma's site search is
 * bot-protected (403), so the feed is the only structured fallback; recall here is
 * bounded by the feed's recent-articles window. Best-effort article-page fetches add
 * body text for summaries (graceful on 403/timeout).
 */

import { generateText } from "ai";
import { createGroqModel, groqModelFastId } from "../../llm/groq";
import type { RawItemInput, ScanTarget, SourceResult } from "../types";
import type { SourceAgentContext } from "../agent-context";
import { fetchWithRetry, sleep } from "../fetchWithRetry";

const FIERCEPHARMA_FEED_URL = "https://www.fiercepharma.com/rss/xml";
const FIERCEPHARMA_DOMAIN = "fiercepharma.com";
const EXA_SEARCH_URL = "https://api.exa.ai/search";
const EXA_TEXT_MAX_CHARS = 3000;
const EXA_NUM_RESULTS = 10;
/** Cap target-tailored summaries per scan (bounds Groq cost), mirroring EDGAR. */
const MAX_SUMMARIZE = 12;
const SUMMARY_EXCERPT_MAX_CHARS = 4000;
const RSS_FETCH_USER_AGENT = "Compass/1.0 (competitive intelligence; +https://github.com/compintel/compass)";
const RSS_BODY_FETCH_MAX_CHARS = 4000;

interface ExaResult {
  id?: string;
  title?: string;
  url?: string;
  text?: string;
  publishedDate?: string;
}

interface CollectedArticle {
  url: string;
  externalId: string;
  title: string;
  /** Article body text: Exa `text`, an RSS-fetched page body, or the feed lede. */
  text: string;
  publishedDate?: string;
  watchTargetIds: ScanTarget["_id"][];
}

/** Match terms for a target (name, displayName, aliases, company, learned terms). */
function targetTerms(t: ScanTarget): string[] {
  const terms = [
    t.name,
    t.displayName,
    ...(t.aliases ?? []),
    t.company,
    ...(t.learnedQueryTerms ?? []),
  ]
    .map((s) => (s ?? "").trim())
    .filter((s) => s.length >= 2);
  return Array.from(new Set(terms));
}

function startPublishedDateForLookback(lookbackDays?: number): string | undefined {
  if (!lookbackDays || lookbackDays <= 0) return undefined;
  return new Date(Date.now() - lookbackDays * 86_400_000).toISOString();
}

/** Primary path: domain-scoped Exa search, one query per target. */
async function collectViaExa(
  context: SourceAgentContext,
  apiKey: string,
): Promise<{ articles: CollectedArticle[]; error?: string }> {
  const startPublishedDate = startPublishedDateForLookback(context.scanOptions?.lookbackDays);
  const byExternalId = new Map<string, CollectedArticle>();
  let lastError: string | undefined;

  for (const target of context.targets) {
    const queryParts = [target.name || target.displayName, target.company]
      .map((x) => (x ?? "").trim())
      .filter((x) => x.length >= 2);
    const query = Array.from(new Set(queryParts)).join(" ").trim();
    if (query.length < 2) continue;
    const body: Record<string, unknown> = {
      query,
      numResults: EXA_NUM_RESULTS,
      type: "auto",
      includeDomains: [FIERCEPHARMA_DOMAIN],
      category: "news",
      contents: { text: { maxCharacters: EXA_TEXT_MAX_CHARS } },
    };
    if (startPublishedDate) body.startPublishedDate = startPublishedDate;

    let res: Response;
    try {
      res = await fetchWithRetry(EXA_SEARCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastError = `Exa fetch failed: ${e instanceof Error ? e.message : String(e)}`;
      continue;
    }
    if (!res.ok) {
      lastError = `Exa search returned ${res.status}`;
      continue;
    }
    const data = (await res.json().catch(() => ({}))) as { results?: ExaResult[] };
    for (const hit of data.results ?? []) {
      const url = (hit.url ?? "").trim();
      if (!url) continue;
      const externalId = hit.id || url;
      const existing = byExternalId.get(externalId);
      if (existing) {
        if (!existing.watchTargetIds.includes(target._id)) existing.watchTargetIds.push(target._id);
        if (!existing.text && hit.text) existing.text = hit.text;
      } else {
        byExternalId.set(externalId, {
          url,
          externalId,
          title: hit.title ?? url,
          text: hit.text ?? "",
          publishedDate: hit.publishedDate,
          watchTargetIds: [target._id],
        });
      }
    }
  }
  return { articles: [...byExternalId.values()], error: lastError };
}

/* --------------------------------- RSS fallback --------------------------------- */

interface FeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
}

/** Crude HTML-to-text for best-effort RSS article body fetches. */
function htmlToPlainText(html: string, maxChars: number): string {
  let s = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[#\w]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > maxChars ? s.slice(0, maxChars) + "…" : s;
}

/** Dependency-free parse of the FiercePharma RSS 2.0 feed (strips CDATA and <a> wrappers in title/guid). */
export function parseRssItems(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[0].replace(/<!\[CDATA\[|\]\]>/g, "");
    const pick = (tag: string): string => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(block);
      return r ? r[1].trim() : "";
    };
    const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").trim();
    const link = stripTags(pick("link"));
    if (!link) continue;
    items.push({
      title: stripTags(pick("title")) || link,
      link,
      description: stripTags(pick("description")),
      pubDate: pick("pubDate").trim(),
      guid: stripTags(pick("guid")),
    });
  }
  return items;
}

const FEED_MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6,
  aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse FiercePharma's Drupal-style pubDate (e.g. "Jun 29, 2026 11:09am") to an ISO
 * string (UTC). Deterministic month-map + UTC construction (not `Date.parse`, which is
 * engine/spec-dependent and lacks a timezone); falls back to native parse for other
 * formats. Returns undefined if unparseable (and warns off-prod so a feed format change
 * is visible — undated rows are dropped by the lookback filter when lookbackDays > 0).
 */
export function parseFeedDate(s: string): string | undefined {
  if (!s) return undefined;
  const m = s.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (m) {
    const mon = FEED_MONTHS[m[1].toLowerCase().slice(0, 3)];
    if (mon !== undefined) {
      let hour = parseInt(m[4], 10) % 12;
      if (/pm/i.test(m[6])) hour += 12;
      return new Date(Date.UTC(+m[3], mon, +m[2], hour, +m[5])).toISOString();
    }
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString();
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[fiercepharma] unparseable pubDate: ${s}`);
  }
  return undefined;
}

export function articleMatchesTarget(item: FeedItem, t: ScanTarget): boolean {
  const hay = `${item.title} ${item.description}`.toLowerCase();
  const excludes = (t.excludeQueryTerms ?? []).map((e) => e.toLowerCase()).filter(Boolean);
  if (excludes.some((e) => hay.includes(e))) return false;
  return targetTerms(t).some((term) => hay.includes(term.toLowerCase()));
}

async function fetchArticleBody(url: string): Promise<string> {
  try {
    const res = await fetchWithRetry(url, {
      headers: { "User-Agent": RSS_FETCH_USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok) return "";
    return htmlToPlainText(await res.text(), RSS_BODY_FETCH_MAX_CHARS);
  } catch {
    return "";
  }
}

async function collectViaRss(
  context: SourceAgentContext,
): Promise<{ articles: CollectedArticle[]; error?: string }> {
  let res: Response;
  try {
    res = await fetchWithRetry(FIERCEPHARMA_FEED_URL, {
      headers: {
        "User-Agent": RSS_FETCH_USER_AGENT,
        Accept: "application/rss+xml,application/xml,text/xml",
      },
    });
  } catch (e) {
    return { articles: [], error: `RSS fetch failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!res.ok) return { articles: [], error: `RSS feed returned ${res.status}` };

  const xml = await res.text().catch(() => "");
  const feedItems = parseRssItems(xml);
  if (feedItems.length === 0) return { articles: [] };

  const byExternalId = new Map<string, CollectedArticle>();
  for (const item of feedItems) {
    const matched = context.targets.filter((t) => articleMatchesTarget(item, t));
    if (matched.length === 0) continue;
    const externalId = item.guid || item.link;
    if (byExternalId.has(externalId)) {
      const existing = byExternalId.get(externalId)!;
      for (const t of matched) if (!existing.watchTargetIds.includes(t._id)) existing.watchTargetIds.push(t._id);
      continue;
    }
    byExternalId.set(externalId, {
      url: item.link,
      externalId,
      title: item.title,
      text: item.description,
      publishedDate: parseFeedDate(item.pubDate),
      watchTargetIds: matched.map((t) => t._id),
    });
  }

  const articles = [...byExternalId.values()];
  const existingFor = (targetId: string): Set<string> => {
    const row = context.existingExternalIdsByWatchTarget?.[targetId]?.fiercepharma;
    return row?.length ? new Set(row) : new Set();
  };
  // Best-effort page bodies only for articles not yet stored for at least one target.
  const toFetch = articles
    .filter((a) => a.watchTargetIds.some((tid) => !existingFor(tid).has(a.externalId)))
    .sort((a, b) => (b.publishedDate ?? "").localeCompare(a.publishedDate ?? ""))
    .slice(0, MAX_SUMMARIZE);
  for (const article of toFetch) {
    await sleep(200);
    const body = await fetchArticleBody(article.url);
    if (body.length > article.text.length) article.text = body;
  }
  return { articles };
}

/* ------------------------------- summary + mapping ------------------------------- */

async function summarizeArticleForTargets(
  article: CollectedArticle,
  targets: ScanTarget[],
  groqKey: string,
): Promise<string | undefined> {
  const excerpt = article.text.slice(0, SUMMARY_EXCERPT_MAX_CHARS).trim();
  if (!excerpt) return undefined;
  const contexts = article.watchTargetIds
    .map((id) => targets.find((t) => t._id === id))
    .filter((t): t is ScanTarget => !!t)
    .slice(0, 5)
    .map((t) => {
      const parts = [`name: ${t.name}`];
      if (t.displayName && t.displayName !== t.name) parts.push(`display: ${t.displayName}`);
      if (t.type) parts.push(`type: ${t.type}`);
      if (t.company) parts.push(`company: ${t.company}`);
      if (t.notes) parts.push(`monitoring notes: ${t.notes.slice(0, 200)}`);
      return `- ${parts.join("; ")}`;
    })
    .join("\n");
  try {
    const { text } = await generateText({
      model: createGroqModel(groqModelFastId(), groqKey),
      prompt: `You are an analyst summarizing a pharma industry news article for competitive intelligence. Below is text from a FiercePharma article found while monitoring the watch targets listed.

Watch targets being monitored:
${contexts}

Article text:
${excerpt}

Task: In 2–4 sentences, summarize the key development (FDA action, approval, deal, pipeline update, trial result, regulatory or business news) and why it matters to someone tracking the watch targets above. Be concrete: cite drug names, companies, trial phases, figures, or dates when present. Do not write generic filler.`,
    });
    return (text ?? "").trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build RawItemInput[] from collected articles, skipping articles already stored per
 * target (`existingExternalIdsByWatchTarget`), and writing target-tailored summaries
 * (Groq) for the newest unique articles (capped). One row per (article, target).
 */
async function toRawItems(
  articles: CollectedArticle[],
  context: SourceAgentContext,
): Promise<RawItemInput[]> {
  const groqKey = context.env.GROQ_API_KEY;
  const existingFor = (targetId: string): Set<string> => {
    const row = context.existingExternalIdsByWatchTarget?.[targetId]?.fiercepharma;
    return row?.length ? new Set(row) : new Set();
  };

  const candidateArticles = articles.filter((a) =>
    a.watchTargetIds.some((tid) => !existingFor(tid).has(a.externalId)),
  );
  if (candidateArticles.length === 0) return [];

  const abstractByExternalId = new Map<string, string>();
  if (groqKey) {
    const toSummarize = candidateArticles
      .sort((a, b) => (b.publishedDate ?? "").localeCompare(a.publishedDate ?? ""))
      .slice(0, MAX_SUMMARIZE);
    let i = 0;
    for (const article of toSummarize) {
      if (i++ % 3 === 0) await sleep(150);
      const summary = await summarizeArticleForTargets(article, context.targets, groqKey);
      if (summary) abstractByExternalId.set(article.externalId, summary);
    }
  }

  const items: RawItemInput[] = [];
  for (const article of candidateArticles) {
    let publishedAt: number | undefined = article.publishedDate
      ? Date.parse(article.publishedDate)
      : undefined;
    if (publishedAt != null && Number.isNaN(publishedAt)) publishedAt = undefined;
    const abstract =
      abstractByExternalId.get(article.externalId) ||
      (article.text.trim() ? article.text.trim().slice(0, 1000) : undefined);
    for (const target of context.targets) {
      if (!article.watchTargetIds.includes(target._id)) continue;
      if (existingFor(target._id).has(article.externalId)) continue;
      items.push({
        watchTargetId: target._id,
        externalId: article.externalId,
        title: article.title,
        url: article.url,
        abstract,
        publishedAt,
        metadata: { source: "fiercepharma_agent", publishedDate: article.publishedDate },
      });
    }
  }
  return items;
}

/**
 * Run the FiercePharma source: Exa domain-scoped search when `EXA_API_KEY` is set,
 * otherwise the RSS feed + keyword-match fallback. Returns SourceResult.
 */
export async function runFiercePharmaAgent(context: SourceAgentContext): Promise<SourceResult> {
  if (context.targets.length === 0) return { items: [] };
  const collected = context.env.EXA_API_KEY
    ? await collectViaExa(context, context.env.EXA_API_KEY)
    : await collectViaRss(context);
  const items = await toRawItems(collected.articles, context);
  if (items.length === 0 && collected.error) return { items: [], error: collected.error };
  return { items };
}
