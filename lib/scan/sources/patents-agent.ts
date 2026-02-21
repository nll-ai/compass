/**
 * Patents (PatentsView) source agent: uses Vercel AI SDK with searchPatents tool (Zod params)
 * for agentic search with query expansion.
 */

import { generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { RawItemInput, ScanTarget, SourceResult } from "../types";
import type { SourceAgentContext } from "../agent-context";
import { fetchWithRetry, sleep } from "../fetchWithRetry";

const THROTTLE_MS = 1700;

interface PatentsViewHit {
  patent_id?: string;
  patent_title?: string;
  patent_abstract?: string;
  patent_date?: string;
}

function assignWatchTargetId(terms: string, targets: ScanTarget[]): ScanTarget["_id"] {
  const t = terms.toLowerCase();
  const match = targets.find((target) => {
    const name = (target.name ?? "").toLowerCase();
    const display = (target.displayName ?? "").toLowerCase();
    const aliases = (target.aliases ?? []).map((a) => a.toLowerCase());
    return (
      t.includes(name) ||
      t.includes(display) ||
      [name, display, ...aliases].some((a) => t.includes(a))
    );
  });
  return match?._id ?? targets[0]._id;
}

/**
 * Run the Patents source agent: receives orchestrator context, performs agentic search
 * via searchPatents tool (Zod params), multi-step. Returns SourceResult.
 */
export async function runPatentsAgent(
  context: SourceAgentContext,
  options: { maxSteps?: number } = {}
): Promise<SourceResult> {
  const { maxSteps = 5 } = options;
  const apiKey = context.env.PATENTSVIEW_API_KEY;
  if (!apiKey || context.targets.length === 0) return { items: [] };

  const collectedItems: RawItemInput[] = [];
  const seenIds = new Set<string>();

  const searchPatents = tool({
    description:
      "Search PatentsView for patents by keywords (title/abstract). terms: space-separated keywords or phrases (e.g. drug name, gene, compound). size: max results (default 15). PatentsView API returns patent_id, patent_title, patent_abstract, patent_date.",
    parameters: z.object({
      terms: z.string().describe("Search terms for patent title/abstract (e.g. drug name, target, compound)"),
      size: z.number().min(1).max(50).default(15).describe("Max number of patents to return"),
    }),
    execute: async ({ terms, size }) => {
      const q = {
        _or: [
          { _text_any: { patent_title: terms.trim() } },
          { _text_any: { patent_abstract: terms.trim() } },
        ],
      };
      const params = new URLSearchParams({
        q: JSON.stringify(q),
        f: JSON.stringify(["patent_id", "patent_title", "patent_abstract", "patent_date"]),
        s: JSON.stringify([{ patent_date: "desc" }]),
        o: JSON.stringify({ size }),
      });
      const res = await fetchWithRetry(
        `https://search.patentsview.org/api/v1/patent/?${params.toString()}`,
        {
          headers: {
            "X-Api-Key": apiKey,
            Accept: "application/json",
          },
        }
      );
      if (!res.ok) return { count: 0, message: `PatentsView: ${res.status}` };
      const data = (await res.json()) as {
        patents?: PatentsViewHit[];
        error?: boolean;
      };
      const patents = data.patents ?? [];
      const watchTargetId = assignWatchTargetId(terms, context.targets);
      for (const p of patents) {
        const id = p.patent_id;
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        collectedItems.push({
          watchTargetId,
          externalId: id,
          title: p.patent_title ?? `Patent ${id}`,
          url: `https://patents.google.com/patent/US${id}`,
          abstract: p.patent_abstract,
          publishedAt: p.patent_date ? new Date(p.patent_date).getTime() : undefined,
          metadata: p.patent_date != null ? { patent_date: p.patent_date } : {},
        });
      }
      await sleep(THROTTLE_MS);
      return { count: patents.length, totalCollected: collectedItems.length, message: `Found ${patents.length} patents.` };
    },
  });

  const targetSummary = context.targets
    .map(
      (t) =>
        `- ${t.displayName} (name: ${t.name}, aliases: ${(t.aliases ?? []).join(", ") || "—"})`
    )
    .join("\n");

  const systemPrompt = `You are a patent search specialist for biopharma competitive intelligence. Your mission: ${context.mission}

Watch targets:
${targetSummary}

Use the searchPatents tool with terms derived from each watch target (drug name, target, company, compound). Call the tool multiple times with different term sets to cover each target.`;

  try {
    await generateText({
      model: openai("gpt-4o-mini"),
      tools: { searchPatents },
      maxSteps,
      system: systemPrompt,
      prompt: "Run patent searches for the watch targets above. Use multiple queries if needed.",
    });
  } catch {
    // Return what we collected
  }

  return { items: collectedItems };
}
