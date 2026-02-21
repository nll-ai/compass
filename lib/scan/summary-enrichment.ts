/**
 * Summary enrichment: for raw items that have no abstract, generate a one-sentence
 * summary from title + source (and optional snippet) so digest cards show real summaries.
 * Used after source agents return and before persisting raw items.
 */

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { RawItemInput } from "./types";

const BATCH_SIZE = 8;

function snippetFor(item: RawItemInput): string {
  const text = (item.abstract ?? item.fullText ?? "").trim();
  if (!text) return "";
  return text.slice(0, 400).trim();
}

/**
 * For items missing abstract, call LLM to produce one sentence per item (batched).
 * Returns a new array with abstract filled in where we generated one.
 */
export async function enrichMissingSummaries(
  items: RawItemInput[],
  source: string,
  openaiKey: string | undefined
): Promise<RawItemInput[]> {
  const needEnrichment = items.filter((i) => !(i.abstract ?? "").trim());
  if (needEnrichment.length === 0 || !openaiKey) return items;

  const summariesByEnrichmentIndex = new Map<number, string>();
  for (let start = 0; start < needEnrichment.length; start += BATCH_SIZE) {
    const batch = needEnrichment.slice(start, start + BATCH_SIZE);
    const summaries = await summarizeBatch(batch, source, openaiKey);
    summaries.forEach((s, i) => summariesByEnrichmentIndex.set(start + i, s));
  }

  let enrichmentIndex = 0;
  return items.map((item) => {
    if ((item.abstract ?? "").trim()) return item;
    const summary = summariesByEnrichmentIndex.get(enrichmentIndex);
    enrichmentIndex++;
    if (!summary) return item;
    return { ...item, abstract: summary };
  });
}

const SummariesSchema = z.object({
  summaries: z.array(z.string()).describe("One sentence summary per item, in the same order"),
});

async function summarizeBatch(
  batch: RawItemInput[],
  source: string,
  openaiKey: string
): Promise<string[]> {
  const lines = batch.map((item, i) => {
    const snip = snippetFor(item);
    return `[${i}] Title: ${item.title}${snip ? `\n    Snippet: ${snip}` : ""}`;
  });

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: SummariesSchema,
    prompt: `You are writing one-sentence summaries for a competitive intelligence digest. For each item below (indexed [0], [1], ...), provide exactly one sentence that states the main point or what the user should know. Be factual and concise. For SEC filings use the title to infer (e.g. "Quarterly 10-Q report for Company X filed on date"). For news/publications describe the main claim or finding. Output the same number of summaries as input items, in order.

Source type: ${source}

Items:
${lines.join("\n\n")}`,
  });

  const summaries = object.summaries ?? [];
  return batch.map((_, i) => (summaries[i] ?? "").trim());
}
