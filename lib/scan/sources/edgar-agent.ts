/**
 * SEC search subagent: uses Vercel AI SDK with tools (full-text search + company lookup)
 * to discover relevant 10-K/10-Q filings with query generation/expansion.
 */

import { generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { RawItemInput, ScanTarget } from "../types";
import { fetchWithRetry } from "../fetchWithRetry";

const SEC_USER_AGENT = "Compass competitive intelligence app (contact via GitHub)";
const EFTS_BASE = "https://efts.sec.gov/LATEST/search-index";
const FORMS_WE_WANT = ["10-K", "10-Q"];

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
): Promise<{ hits: Array<{ title: string; url: string; fileDate: string; form: string; companyName: string; adsh: string; cik: string }>; total: number }> {
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
    headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" },
  });

  if (!res.ok) {
    return { hits: [], total: 0 };
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
): Promise<{ hits: Array<{ title: string; url: string; fileDate: string; form: string; companyName: string; adsh: string; cik: string }> }> {
  const { maxFilings = 25 } = options;
  const term = companyOrTicker.trim().toLowerCase();
  if (!term) return { hits: [] };

  const res = await fetchWithRetry("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) return { hits: [] };

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
    { headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" } }
  );
  if (!subRes.ok) return { hits: [] };

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
 * Run the SEC search subagent: LLM with tools that can call full-text search and company lookup,
 * with query expansion. Returns collected SEC filings as RawItemInput[].
 */
export async function runSECSearchAgent(
  targets: ScanTarget[],
  openaiKey: string | undefined,
  options: { maxSteps?: number; fullTextCount?: number } = {}
): Promise<RawItemInput[]> {
  const { maxSteps = 5, fullTextCount = 15 } = options;
  if (!openaiKey || targets.length === 0) return [];

  const collectedHits = new Map<string, SECAgentHit>();

  function recordHits(hits: SECAgentHit[]) {
    for (const h of hits) {
      if (h.adsh && !collectedHits.has(h.adsh)) collectedHits.set(h.adsh, h);
    }
  }

  // Use target.company for every target that has it: run company lookup before the agent so agentic SEC search reliably uses this improvement.
  for (const target of targets) {
    const company = target.company?.trim();
    if (!company) continue;
    try {
      const { hits } = await searchSECByCompanyAPI(company, { maxFilings: 25 });
      recordHits(hits);
    } catch {
      // Ignore per-company errors (e.g. not in SEC list)
    }
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
      const { hits } = await searchSECFullTextAPI(query, {
        start: 0,
        count: fullTextCount,
        startDate,
        endDate,
        forms: forms?.length ? forms : FORMS_WE_WANT,
      });
      recordHits(hits);
      return { total: hits.length, hits: hits.slice(0, 10), message: `Found ${hits.length} filings. Use searchSECByCompany for a specific company's filings.` };
    },
  });

  const searchSECByCompany = tool({
    description:
      "Get 10-K and 10-Q filings for a specific company by name or ticker (e.g. Genocea, GNCA). Use when you know the company name or ticker.",
    parameters: z.object({
      companyOrTicker: z.string().describe("Company name or stock ticker symbol"),
    }),
    execute: async ({ companyOrTicker }) => {
      const { hits } = await searchSECByCompanyAPI(companyOrTicker, { maxFilings: 25 });
      recordHits(hits);
      return { total: hits.length, hits: hits.slice(0, 10), message: `Found ${hits.length} filings for ${companyOrTicker}.` };
    },
  });

  const targetSummary = targets
    .map(
      (t) =>
        `- ${t.displayName} (name: ${t.name}, company: ${t.company ?? "—"}, aliases: ${(t.aliases ?? []).join(", ") || "—"})`
    )
    .join("\n");

  const prompt = `You are an SEC EDGAR search specialist for biopharma competitive intelligence. For each watch target below, find relevant SEC 10-K and 10-Q filings (pipeline updates, trial discontinuations, material business changes).

Watch targets:
${targetSummary}

You must use both approaches:
1. Full-text search: Call searchSECFullText with queries that combine the program/drug name (or target.name) with phrases like "discontinued", "clinical trial", "terminated", or the company name. Use quoted phrases for exact match. Use date ranges (e.g. startDate 2015-01-01, endDate 2024-12-31) and forms 10-K, 10-Q when relevant.
2. Company lookup: For any target that has a "company" value above, call searchSECByCompany with that company name or ticker (from aliases) to get that company's 10-K/10-Q filings. Company lookups may already have been run for some targets; call again if you want to ensure coverage or use a ticker from aliases.

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

  // Map collected hits to RawItemInput with best-effort watchTargetId
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
      abstract: undefined,
      publishedAt: hit.fileDate ? new Date(hit.fileDate).getTime() : undefined,
      metadata: { cik: hit.cik, form: hit.form, company: hit.companyName, source: "edgar_agent" },
    });
  }

  return items;
}
