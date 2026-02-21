/**
 * SEC search subagent: uses Vercel AI SDK with tools (full-text search + company lookup)
 * to discover relevant 10-K/10-Q filings with query generation/expansion.
 */

import { generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { RawItemInput, ScanTarget, SourceResult } from "../types";
import type { SourceAgentContext } from "../agent-context";
import { fetchWithRetry, sleep } from "../fetchWithRetry";

const SEC_USER_AGENT_DEFAULT = "Compass competitive intelligence app (contact via GitHub)";
const EFTS_BASE = "https://efts.sec.gov/LATEST/search-index";

function getSECUserAgent(): string {
  return process.env.SEC_EDGAR_USER_AGENT?.trim() || SEC_USER_AGENT_DEFAULT;
}

const SEC_403_MESSAGE =
  " If this is 403, SEC requires a declared User-Agent (see https://www.sec.gov/developer). Set SEC_EDGAR_USER_AGENT in your env to a value SEC accepts (e.g. \"YourCompany AdminContact@yourcompany.com\").";
const FORMS_WE_WANT = ["10-K", "10-Q"];

/** Max chars of filing text to send to the summarizer (10-K/10-Q are large). */
const FILING_EXCERPT_MAX_CHARS = 18_000;
/** How many filings to fetch and summarize (most recent by file date). */
const MAX_FILINGS_TO_SUMMARIZE = 30;
/** Delay between SEC document fetches to respect rate limits. */
const SEC_FETCH_DELAY_MS = 1200;
/** How many filings to summarize in parallel (balance speed vs SEC rate limits). */
const SUMMARIZE_PARALLEL = 3;

/** Strip HTML to plain text and truncate. */
function htmlToPlainText(html: string, maxChars: number): string {
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > maxChars) text = text.slice(0, maxChars) + "…";
  return text;
}

/** Fetch SEC filing document and return plain-text excerpt for summarization. */
async function fetchFilingText(url: string): Promise<string> {
  const res = await fetchWithRetry(url, {
    headers: { "User-Agent": getSECUserAgent(), Accept: "text/html" },
  });
  if (!res.ok) return "";
  const html = await res.text();
  return htmlToPlainText(html, FILING_EXCERPT_MAX_CHARS);
}

/** Use LLM to extract 1–3 sentences about the watch target(s) from an SEC filing excerpt. */
async function summarizeFilingForTargets(
  filingExcerpt: string,
  form: string,
  fileDate: string,
  targetNames: string[],
  openaiKey: string | undefined
): Promise<string> {
  if (!openaiKey || !filingExcerpt.trim() || targetNames.length === 0) return "";
  const targetList = targetNames.slice(0, 5).join(", ");
  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    prompt: `You are an analyst summarizing SEC filings for competitive intelligence. Below is an excerpt from a ${form} filed ${fileDate}.

Watch targets of interest: ${targetList}

Excerpt:
${filingExcerpt.slice(0, 14_000)}

Task: In 1–3 sentences, state what this filing discloses about any of the watch targets (e.g. trial status, discontinuation, pipeline, material events). If there is no relevant disclosure about these targets, reply with exactly: "No specific disclosure about the watch targets in this excerpt." Keep the response concise and factual.`,
  });
  return (text ?? "").trim();
}

interface CompanyTickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

interface SubmissionsRecent {
  form?: string[];
  accessionNumber?: string[];
  filingDate?: string[];
  primaryDocument?: string[];
}

function padCik(cik: number): string {
  return cik.toString().padStart(10, "0");
}

function accessionToPath(acc: string): string {
  return acc.replace(/-/g, "");
}

/** Full-text search response from efts.sec.gov (Elasticsearch-style). */
interface EFTSHit {
  _id?: string;
  _source?: {
    ciks?: string[];
    display_names?: string[];
    form?: string;
    root_forms?: string[];
    file_date?: string;
    adsh?: string;
    file_type?: string;
  };
}

interface EFTSSearchResult {
  hits?: {
    hits?: EFTSHit[];
    total?: { value?: number };
  };
}

/**
 * Call SEC full-text search API. Returns structured hits for the agent.
 */
export async function searchSECFullTextAPI(
  query: string,
  options: { start?: number; count?: number; startDate?: string; endDate?: string; forms?: string[] } = {}
): Promise<{
  hits: Array<{ title: string; url: string; fileDate: string; form: string; companyName: string; adsh: string; cik: string }>;
  total: number;
  error?: string;
}> {
  const { start = 0, count = 20, startDate, endDate, forms = FORMS_WE_WANT } = options;
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("start", String(start));
  params.set("count", String(count));
  if (startDate) params.set("dateRange", "custom");
  if (startDate) params.set("startdt", startDate);
  if (endDate) params.set("enddt", endDate);
  if (forms.length) params.set("forms", forms.join(","));

  const url = `${EFTS_BASE}?${params.toString()}`;
  const res = await fetchWithRetry(url, {
    headers: { "User-Agent": getSECUserAgent(), Accept: "application/json" },
  });

  if (!res.ok) {
    const error = `SEC EDGAR full-text search returned ${res.status}.${res.status === 403 ? SEC_403_MESSAGE : ""}`;
    return { hits: [], total: 0, error };
  }

  const data = (await res.json()) as EFTSSearchResult;
  const rawHits = data.hits?.hits ?? [];
  const total = data.hits?.total?.value ?? 0;

  const hits = rawHits
    .filter((h) => {
      const form = h._source?.form ?? h._source?.root_forms?.[0];
      return form && FORMS_WE_WANT.includes(form);
    })
    .slice(0, count)
    .map((h) => {
      const src = h._source ?? {};
      const cik = src.ciks?.[0] ?? "";
      const adsh = src.adsh ?? "";
      const pathPart = accessionToPath(adsh);
      const displayName = src.display_names?.[0] ?? "Unknown";
      const form = src.form ?? src.root_forms?.[0] ?? "";
      const fileDate = src.file_date ?? "";
      const docId = h._id ?? "";
      const filename = docId.includes(":") ? docId.split(":")[1] : `${pathPart}.htm`;
      const url = cik && pathPart
        ? `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${pathPart}/${filename}`
        : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}`;
      const title = `${form} - ${displayName}${fileDate ? ` (${fileDate})` : ""}`;
      return {
        title,
        url,
        fileDate,
        form,
        companyName: displayName,
        adsh,
        cik,
      };
    });

  return { hits, total };
}

/**
 * Company lookup: SEC company list + submissions for a given name/ticker. Returns 10-K/10-Q filings.
 */
export async function searchSECByCompanyAPI(
  companyOrTicker: string,
  options: { maxFilings?: number } = {}
): Promise<{
  hits: Array<{ title: string; url: string; fileDate: string; form: string; companyName: string; adsh: string; cik: string }>;
  error?: string;
}> {
  const { maxFilings = 25 } = options;
  const term = companyOrTicker.trim().toLowerCase();
  if (!term) return { hits: [] };

  const res = await fetchWithRetry("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": getSECUserAgent(), Accept: "application/json" },
  });
  if (!res.ok) {
    const error = `SEC EDGAR company list returned ${res.status}.${res.status === 403 ? SEC_403_MESSAGE : ""}`;
    return { hits: [], error };
  }

  const data = (await res.json()) as Record<string, CompanyTickerEntry>;
  const companies = Object.values(data);
  const match = companies.find((c) => {
    const title = (c.title ?? "").toLowerCase();
    const ticker = (c.ticker ?? "").toLowerCase();
    return title.includes(term) || ticker === term || title === term;
  });
  if (!match) return { hits: [] };

  const cikPadded = padCik(match.cik_str);
  const subRes = await fetchWithRetry(
    `https://data.sec.gov/submissions/CIK${cikPadded}.json`,
    { headers: { "User-Agent": getSECUserAgent(), Accept: "application/json" } }
  );
  if (!subRes.ok) {
    const error = `SEC EDGAR submissions returned ${subRes.status}.${subRes.status === 403 ? SEC_403_MESSAGE : ""}`;
    return { hits: [], error };
  }

  const sub = (await subRes.json()) as { filings?: { recent?: SubmissionsRecent }; recent?: SubmissionsRecent };
  const recent = sub.filings?.recent ?? sub.recent;
  if (!recent?.form || !recent.accessionNumber) return { hits: [] };

  const forms = recent.form as string[];
  const accessions = recent.accessionNumber as string[];
  const dates = (recent.filingDate as string[]) ?? [];
  const primaries = (recent.primaryDocument as string[]) ?? [];
  const hits: Array<{ title: string; url: string; fileDate: string; form: string; companyName: string; adsh: string; cik: string }> = [];

  for (let i = 0; i < Math.min(forms.length, maxFilings); i++) {
    if (!FORMS_WE_WANT.includes(forms[i])) continue;
    const acc = accessions[i];
    if (!acc) continue;
    const pathPart = accessionToPath(acc);
    const primary = primaries[i] ?? `${pathPart}.htm`;
    const url = `https://www.sec.gov/Archives/edgar/data/${match.cik_str}/${pathPart}/${primary}`;
    const dateStr = dates[i] ?? "";
    hits.push({
      title: `${forms[i]} - ${match.title}${dateStr ? ` (${dateStr})` : ""}`,
      url,
      fileDate: dateStr,
      form: forms[i],
      companyName: match.title,
      adsh: acc,
      cik: String(match.cik_str),
    });
  }
  return { hits };
}

/** One hit from tools, normalized for collection. */
export interface SECAgentHit {
  title: string;
  url: string;
  fileDate: string;
  form: string;
  companyName: string;
  adsh: string;
  cik: string;
}

/**
 * Run the SEC EDGAR source agent: receives orchestrator context (mission, targets, env),
 * performs agentic search with tools (full-text search + company lookup), returns SourceResult.
 */
export async function runEdgarAgent(
  context: SourceAgentContext,
  options: { maxSteps?: number; fullTextCount?: number } = {}
): Promise<SourceResult> {
  const { items, error } = await runSECSearchAgent(
    context.targets,
    context.env.OPENAI_API_KEY,
    {
      ...options,
      mission: context.mission,
      existingExternalIds: context.existingExternalIdsBySource?.edgar,
    }
  );
  return { items, error };
}

/**
 * Run the SEC search subagent: LLM with tools that can call full-text search and company lookup,
 * with query expansion. Returns collected SEC filings as RawItemInput[].
 */
export async function runSECSearchAgent(
  targets: ScanTarget[],
  openaiKey: string | undefined,
  options: {
    maxSteps?: number;
    fullTextCount?: number;
    mission?: string;
    /** External IDs already stored for this source; prioritize summarizing filings not in this set. */
    existingExternalIds?: Set<string>;
  } = {}
): Promise<{ items: RawItemInput[]; error?: string }> {
  const { maxSteps = 5, fullTextCount = 15, mission, existingExternalIds } = options;
  if (!openaiKey || targets.length === 0) return { items: [] };

  const collectedHits = new Map<string, SECAgentHit>();
  let lastSECError: string | undefined;

  function recordHits(hits: SECAgentHit[]) {
    for (const h of hits) {
      if (h.adsh && !collectedHits.has(h.adsh)) collectedHits.set(h.adsh, h);
    }
  }

  // Pre-seed with full-text search by target name so we always get filings that mention the program (e.g. "GEN-003" → Genocea 10-K/10-Qs). This is the most reliable path: SEC full-text index finds documents containing the name.
  for (const target of targets) {
    const name = target.name?.trim();
    if (!name || name.length < 2) continue;
    const result = await searchSECFullTextAPI(name, {
      start: 0,
      count: fullTextCount,
      forms: FORMS_WE_WANT,
    });
    if (result.error) lastSECError = result.error;
    recordHits(result.hits);
  }

  // Pre-seed with company lookup when target.company is set (company list + submissions API).
  for (const target of targets) {
    const company = target.company?.trim();
    if (!company) continue;
    const result = await searchSECByCompanyAPI(company, { maxFilings: 25 });
    if (result.error) lastSECError = result.error;
    recordHits(result.hits);
  }

  const searchSECFullText = tool({
    description:
      "Search SEC EDGAR full-text for keywords/phrases (e.g. discontinued, clinical trial, terminated, or a company/drug name). Use quoted phrases for exact match. Optional date range and form filter (10-K, 10-Q).",
    parameters: z.object({
      query: z.string().describe("Search query: keywords, quoted phrases, or company/drug name"),
      startDate: z.string().optional().describe("Start date YYYY-MM-DD for filings"),
      endDate: z.string().optional().describe("End date YYYY-MM-DD for filings"),
      forms: z.array(z.string()).optional().describe("Form types, e.g. ['10-K','10-Q']"),
    }),
    execute: async ({ query, startDate, endDate, forms }) => {
      const result = await searchSECFullTextAPI(query, {
        start: 0,
        count: fullTextCount,
        startDate,
        endDate,
        forms: forms?.length ? forms : FORMS_WE_WANT,
      });
      if (result.error) lastSECError = result.error;
      recordHits(result.hits);
      return { total: result.hits.length, hits: result.hits.slice(0, 10), message: `Found ${result.hits.length} filings. Use searchSECByCompany for a specific company's filings.` };
    },
  });

  const searchSECByCompany = tool({
    description:
      "Get 10-K and 10-Q filings for a specific company by name or ticker (e.g. Genocea, GNCA). Use when you know the company name or ticker.",
    parameters: z.object({
      companyOrTicker: z.string().describe("Company name or stock ticker symbol"),
    }),
    execute: async ({ companyOrTicker }) => {
      const result = await searchSECByCompanyAPI(companyOrTicker, { maxFilings: 25 });
      if (result.error) lastSECError = result.error;
      recordHits(result.hits);
      return { total: result.hits.length, hits: result.hits.slice(0, 10), message: `Found ${result.hits.length} filings for ${companyOrTicker}.` };
    },
  });

  const targetSummary = targets
    .map(
      (t) =>
        `- ${t.displayName} (name: ${t.name}, company: ${t.company ?? "—"}, aliases: ${(t.aliases ?? []).join(", ") || "—"})`
    )
    .join("\n");

  const missionBlock = mission ? `Mission: ${mission}\n\n` : "";

  const prompt = `${missionBlock}You are an SEC EDGAR search specialist for biopharma competitive intelligence. For each watch target below, find relevant SEC 10-K and 10-Q filings (pipeline updates, trial discontinuations, material business changes).

Watch targets:
${targetSummary}

Baseline: Full-text search by each target's name (e.g. GEN-003) and company lookups for targets with a company have already been run. You should expand coverage by:
1. Full-text search: Call searchSECFullText with queries that combine the program/drug name (target.name) with phrases like "discontinued", "clinical trial", "terminated", or the company name. The most effective query is often the exact program name (e.g. "GEN-003"). Use quoted phrases for exact match. Use date ranges (e.g. startDate 2015-01-01, endDate 2024-12-31) and forms 10-K, 10-Q when relevant.
2. Company lookup: For targets with a "company" value, call searchSECByCompany with that company name or ticker to get additional 10-K/10-Q filings. Call again with ticker from aliases if you want more coverage.

Prefer 10-K for annual disclosures. Call the tools as needed (multiple full-text queries and company lookups). After a few tool calls, summarize briefly.`;

  try {
    const result = await generateText({
      model: openai("gpt-4o-mini"),
      tools: { searchSECFullText, searchSECByCompany },
      maxSteps,
      prompt,
    });

    const steps = await result.steps;
    for (const step of steps) {
      const toolResults = step.toolResults ?? [];
      for (const tr of toolResults) {
        const resultData = tr.result as { hits?: SECAgentHit[] } | undefined;
        if (resultData?.hits) recordHits(resultData.hits);
      }
    }
  } catch (_err) {
    // Agent failure: return what we collected so far (may be empty)
  }

  // Enrich latest filings not yet in signals: sort by date (newest first), skip already-stored, take top N for fetch+summarize
  const adshToAbstract = new Map<string, string>();
  const sortedHits = [...collectedHits.values()].sort((a, b) => {
    const da = a.fileDate || "";
    const db = b.fileDate || "";
    return db.localeCompare(da);
  });
  const notYetStored = existingExternalIds
    ? sortedHits.filter((h) => !existingExternalIds.has(h.adsh))
    : sortedHits;
  const toSummarize = notYetStored.slice(0, MAX_FILINGS_TO_SUMMARIZE);
  const targetNames = targets.map((t) => t.name).filter(Boolean);

  for (let i = 0; i < toSummarize.length; i += SUMMARIZE_PARALLEL) {
    const chunk = toSummarize.slice(i, i + SUMMARIZE_PARALLEL);
    await Promise.all(
      chunk.map(async (hit) => {
        await sleep(SEC_FETCH_DELAY_MS);
        try {
          const text = await fetchFilingText(hit.url);
          if (!text) return;
          const summary = await summarizeFilingForTargets(
            text,
            hit.form,
            hit.fileDate ?? "",
            targetNames,
            openaiKey
          );
          if (summary && !summary.toLowerCase().includes("no specific disclosure")) {
            adshToAbstract.set(hit.adsh, summary);
          }
        } catch {
          // Skip this filing on fetch/summary failure
        }
      })
    );
  }

  // Map collected hits to RawItemInput with best-effort watchTargetId and parsed abstract
  const items: RawItemInput[] = [];
  for (const hit of collectedHits.values()) {
    const companyNameLower = hit.companyName.toLowerCase();
    const matchedTarget = targets.find((t) => {
      const name = (t.name ?? "").toLowerCase();
      const display = (t.displayName ?? "").toLowerCase();
      const company = (t.company ?? "").toLowerCase();
      const aliases = (t.aliases ?? []).map((a) => a.toLowerCase());
      return (
        companyNameLower.includes(company) ||
        company.includes(companyNameLower) ||
        name.includes(companyNameLower) ||
        companyNameLower.includes(name) ||
        aliases.some((a) => companyNameLower.includes(a) || a.includes(companyNameLower))
      );
    });
    const watchTargetId = matchedTarget?._id ?? targets[0]._id;
    items.push({
      watchTargetId,
      externalId: hit.adsh,
      title: hit.title,
      url: hit.url,
      abstract: adshToAbstract.get(hit.adsh),
      publishedAt: hit.fileDate ? new Date(hit.fileDate).getTime() : undefined,
      metadata: { cik: hit.cik, form: hit.form, company: hit.companyName, source: "edgar_agent" },
    });
  }

  // When we have 0 items, surface SEC API error so the user sees why (e.g. 403 User-Agent).
  if (items.length === 0 && lastSECError) {
    return { items: [], error: lastSECError };
  }
  return { items };
}
