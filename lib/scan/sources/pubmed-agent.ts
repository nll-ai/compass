/**
 * PubMed source agent: uses Vercel AI SDK with tools (esearch, esummary, efetch)
 * to perform agentic search with structured parameters (Zod).
 */

import { generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { RawItemInput, ScanTarget, SourceResult } from "../types";
import type { SourceAgentContext } from "../agent-context";
import { fetchWithRetry, sleep } from "../fetchWithRetry";

const THROTTLE_MS = 200;

interface PubMedHit {
  pmid: string;
  title: string;
  url: string;
  abstract?: string;
  publishedAt?: number;
  metadata?: Record<string, unknown>;
}

async function searchPubMedAPI(
  term: string,
  apiKey: string | undefined,
  options: { retmax?: number; mindate?: string; maxdate?: string } = {}
): Promise<PubMedHit[]> {
  const { retmax = 20, mindate, maxdate } = options;
  const params = new URLSearchParams({
    db: "pubmed",
    term,
    retmax: String(retmax),
    retmode: "json",
  });
  if (apiKey) params.set("api_key", apiKey);
  if (mindate) params.set("mindate", mindate);
  if (maxdate) params.set("maxdate", maxdate);

  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${params.toString()}`;
  const searchRes = await fetchWithRetry(searchUrl);
  if (!searchRes.ok) return [];

  const searchData = (await searchRes.json()) as { esearchresult?: { idlist?: string[] } };
  const idlist = searchData.esearchresult?.idlist ?? [];
  if (idlist.length === 0) return [];

  await sleep(THROTTLE_MS);
  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${idlist.join(",")}&retmode=json${apiKey ? `&api_key=${apiKey}` : ""}`;
  const summaryRes = await fetchWithRetry(summaryUrl);
  if (!summaryRes.ok) return [];

  const summaryData = (await summaryRes.json()) as {
    result?: Record<string, { title?: string; pubdate?: string; sortpubdate?: string }>;
  };
  const result = summaryData.result ?? {};

  const hits: PubMedHit[] = [];
  for (const pmid of idlist) {
    const entry = result[pmid];
    const title = entry?.title?.trim() || `PubMed ${pmid}`;
    const sortpubdate = entry?.sortpubdate;
    let publishedAt: number | undefined =
      sortpubdate != null ? new Date(sortpubdate.replace(" ", "T")).getTime() : undefined;
    if (publishedAt != null && Number.isNaN(publishedAt)) publishedAt = undefined;
    hits.push({
      pmid,
      title,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      publishedAt,
      metadata: entry?.pubdate != null ? { pubdate: entry.pubdate } : {},
    });
  }
  return hits;
}

function assignWatchTargetId(hit: PubMedHit, targets: ScanTarget[]): ScanTarget["_id"] {
  const titleLower = hit.title.toLowerCase();
  const match = targets.find((t) => {
    const name = (t.name ?? "").toLowerCase();
    const display = (t.displayName ?? "").toLowerCase();
    const aliases = (t.aliases ?? []).map((a) => a.toLowerCase());
    return (
      titleLower.includes(name) ||
      titleLower.includes(display) ||
      aliases.some((a) => titleLower.includes(a))
    );
  });
  return match?._id ?? targets[0]._id;
}

/**
 * Run the PubMed source agent: receives orchestrator context, performs agentic search
 * via searchPubMed tool (Zod params), multi-step query expansion. Returns SourceResult.
 */
export async function runPubMedAgent(
  context: SourceAgentContext,
  options: { maxSteps?: number } = {}
): Promise<SourceResult> {
  const { maxSteps = 5 } = options;
  const apiKey = context.env.PUBMED_API_KEY;
  if (!apiKey || context.targets.length === 0) return { items: [] };

  const collectedHits: PubMedHit[] = [];
  const seenPmids = new Set<string>();

  const searchPubMed = tool({
    description:
      "Search PubMed for articles by query term. Use E-utilities: esearch returns PMIDs, then esummary returns titles and dates. Use mindate/maxdate (YYYY/MM/DD) to focus on recent publications. Combine drug/target names with scope terms (e.g. clinical, human, therapy).",
    parameters: z.object({
      term: z.string().describe("PubMed search query (e.g. drug name OR gene AND clinical trial)"),
      retmax: z.number().min(1).max(100).default(20).describe("Max number of results to return"),
      mindate: z.string().optional().describe("Start date YYYY/MM/DD for publication date filter"),
      maxdate: z.string().optional().describe("End date YYYY/MM/DD for publication date filter"),
    }),
    execute: async ({ term, retmax, mindate, maxdate }) => {
      const hits = await searchPubMedAPI(term, apiKey, { retmax, mindate, maxdate });
      for (const h of hits) {
        if (!seenPmids.has(h.pmid)) {
          seenPmids.add(h.pmid);
          collectedHits.push(h);
        }
      }
      return { count: hits.length, totalCollected: collectedHits.length, message: `Found ${hits.length} articles for "${term.slice(0, 50)}...".` };
    },
  });

  const targetSummary = context.targets
    .map(
      (t) =>
        `- ${t.displayName} (name: ${t.name}, aliases: ${(t.aliases ?? []).join(", ") || "—"}, therapeuticArea: ${t.therapeuticArea ?? "—"})`
    )
    .join("\n");

  const systemPrompt = `You are a PubMed search specialist for biopharma competitive intelligence. Your mission: ${context.mission}

Watch targets:
${targetSummary}

PubMed E-utilities: Use the searchPubMed tool with a "term" parameter (PubMed query syntax). You can use AND, OR, NOT, and quoted phrases. Add scope terms like (human OR clinical OR drug) to avoid plant/agricultural results. Use mindate/maxdate to focus on recent papers. Call the tool multiple times with different queries (e.g. per target, or expanded terms) until you have good coverage.`;

  try {
    await generateText({
      model: openai("gpt-4o-mini"),
      tools: { searchPubMed },
      maxSteps,
      system: systemPrompt,
      prompt: "Run PubMed searches for the watch targets above. Use multiple queries if needed to cover each target and the mission.",
    });
  } catch {
    // Return what we collected so far
  }

  const items: RawItemInput[] = [];
  for (const hit of collectedHits) {
    const watchTargetId = assignWatchTargetId(hit, context.targets);
    items.push({
      watchTargetId,
      externalId: hit.pmid,
      title: hit.title,
      url: hit.url,
      abstract: hit.abstract,
      publishedAt: hit.publishedAt,
      metadata: hit.metadata ?? {},
    });
  }
  return { items };
}
