/**
 * PubMed source agent: uses Vercel AI SDK with tools (esearch, esummary, efetch)
 * to perform agentic search with structured parameters (Zod).
 */

import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { z } from "zod";
import { createGroqModel, groqModelFastId } from "../../llm/groq";
import type { RawItemInput, ScanTarget, SourceResult, ScanOptions } from "../types";
import type { SourceAgentContext } from "../agent-context";
import { fetchWithRetry, sleep } from "../fetchWithRetry";
import {
  DEFAULT_CONTEMPORANEOUS_YEARS,
  applyPubmedEsearchDateParams,
  getPubmedEsearchDateFields,
} from "../pubmed-esearch-dates";

const THROTTLE_MS = 200;

interface PubMedHitCore {
  pmid: string;
  title: string;
  url: string;
  abstract?: string;
  publishedAt?: number;
  metadata?: Record<string, unknown>;
}

type PubMedHit = PubMedHitCore & { watchTargetId: ScanTarget["_id"] };

async function searchPubMedAPI(
  term: string,
  apiKey: string | undefined,
  scanOptions: ScanOptions | undefined,
  options: { retmax?: number } = {}
): Promise<PubMedHitCore[]> {
  const { retmax = 20 } = options;
  const params = new URLSearchParams({
    db: "pubmed",
    term,
    retmax: String(retmax),
    retmode: "json",
  });
  if (apiKey) params.set("api_key", apiKey);
  applyPubmedEsearchDateParams(params, scanOptions);

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

  const hits: PubMedHitCore[] = [];
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

function assignWatchTargetIdFromTerm(term: string, targets: ScanTarget[]): ScanTarget["_id"] {
  const t = term.toLowerCase();
  const match = targets.find((target) => {
    const name = (target.name ?? "").toLowerCase();
    const display = (target.displayName ?? "").toLowerCase();
    const aliases = (target.aliases ?? []).map((a) => a.toLowerCase());
    return (
      t.includes(name) ||
      t.includes(display) ||
      [name, display, ...aliases].some((a) => a.length >= 2 && t.includes(a))
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
  const groqKey = context.env.GROQ_API_KEY;
  if (!apiKey || !groqKey || context.targets.length === 0) return { items: [] };

  const collectedHits: PubMedHit[] = [];
  const seenTargetPmid = new Set<string>();

  const searchPubMed = tool({
    description:
      "Search PubMed for articles by query term. Publication-date filtering is applied by the server (not in this tool). Use E-utilities: esearch returns PMIDs, then esummary returns titles and dates. Combine drug/target names with scope terms (e.g. clinical, human, therapy).",
    inputSchema: z.object({
      term: z.string().describe("PubMed search query (e.g. drug name OR gene AND clinical trial)"),
      retmax: z.number().min(1).max(100).default(20).describe("Max number of results to return"),
    }),
    execute: async ({ term, retmax }) => {
      const dateCfg =
        context.scanOptions?.pubmedPubDate ?? {
          mode: "contemporaneous" as const,
          years: DEFAULT_CONTEMPORANEOUS_YEARS,
        };
      console.log("[searchPubMed]", {
        term,
        retmax,
        pubmedPubDate: dateCfg,
        esearchPdat: getPubmedEsearchDateFields(context.scanOptions),
      });
      const watchTargetId = assignWatchTargetIdFromTerm(term, context.targets);
      const hits = await searchPubMedAPI(term, apiKey, context.scanOptions, { retmax });
      for (const h of hits) {
        const key = `${watchTargetId}:${h.pmid}`;
        if (seenTargetPmid.has(key)) continue;
        seenTargetPmid.add(key);
        collectedHits.push({ ...h, watchTargetId });
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

PubMed E-utilities: Use the searchPubMed tool with "term" (PubMed query syntax). You can use AND, OR, NOT, and quoted phrases. Add scope terms like (human OR clinical OR drug) to avoid plant/agricultural results. Do not encode calendar years or date ranges in the query to substitute for publication filters — the server applies publication-date rules separately. Call the tool multiple times with different queries (e.g. per target, or expanded terms) until you have good coverage.`;

  const pubmedAgent = new ToolLoopAgent({
    model: createGroqModel(groqModelFastId(), groqKey),
    instructions: systemPrompt,
    tools: { searchPubMed },
    stopWhen: stepCountIs(maxSteps),
  });

  try {
    await pubmedAgent.generate({
      prompt:
        "Run PubMed searches for the watch targets above. Use multiple queries if needed to cover each target and the mission.",
    });
  } catch {
    // Return what we collected so far
  }

  const items: RawItemInput[] = [];
  for (const hit of collectedHits) {
    items.push({
      watchTargetId: hit.watchTargetId,
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
