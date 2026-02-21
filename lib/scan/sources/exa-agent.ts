/**
 * Exa source agent: uses Vercel AI SDK with searchExa tool (Zod params)
 * for agentic search with query expansion.
 */

import { generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { RawItemInput, ScanTarget, SourceResult } from "../types";
import type { SourceAgentContext } from "../agent-context";
import { fetchWithRetry } from "../fetchWithRetry";

function assignWatchTargetId(
  query: string,
  targets: ScanTarget[]
): ScanTarget["_id"] {
  const q = query.toLowerCase();
  const match = targets.find((t) => {
    const name = (t.name ?? "").toLowerCase();
    const display = (t.displayName ?? "").toLowerCase();
    const aliases = (t.aliases ?? []).map((a) => a.toLowerCase());
    return (
      q.includes(name) ||
      q.includes(display) ||
      aliases.some((a) => q.includes(a))
    );
  });
  return match?._id ?? targets[0]._id;
}

/**
 * Run the Exa source agent: receives orchestrator context, performs agentic search
 * via searchExa tool (Zod params), multi-step. Returns SourceResult.
 */
export async function runExaAgent(
  context: SourceAgentContext,
  options: { maxSteps?: number } = {}
): Promise<SourceResult> {
  const { maxSteps = 5 } = options;
  const apiKey = context.env.EXA_API_KEY;
  if (!apiKey || context.targets.length === 0) return { items: [] };

  const collectedItems: RawItemInput[] = [];
  const seenUrls = new Set<string>();

  const searchExa = tool({
    description:
      "Search the web for content using Exa AI. Use query to describe what you are looking for (e.g. drug name clinical trial results, company pipeline update). Add scope like 'biopharma clinical' to focus on human drug development. numResults: how many results to return (default 10).",
    parameters: z.object({
      query: z.string().describe("Search query: topic, drug/target name, and optional scope terms (e.g. biopharma clinical)"),
      numResults: z.number().min(1).max(50).default(10).describe("Number of results to return"),
      type: z.enum(["auto", "keyword", "neural"]).optional().describe("Search type: auto, keyword, or neural"),
    }),
    execute: async ({ query, numResults, type }) => {
      const res = await fetchWithRetry("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          query: query.trim() ? `${query} biopharma drug development clinical` : "biopharma drug development clinical",
          numResults,
          type: type ?? "auto",
          contents: { text: { maxCharacters: 500 } },
        }),
      });
      if (!res.ok) return { count: 0, message: `Exa API: ${res.status}` };
      const data = (await res.json()) as {
        results?: Array<{
          id: string;
          title?: string;
          url?: string;
          text?: string;
          publishedDate?: string;
        }>;
      };
      const results = data.results ?? [];
      const watchTargetId = assignWatchTargetId(query, context.targets);
      for (const hit of results) {
        const url = hit.url ?? "";
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          const externalId = hit.id ?? url;
          let publishedAt: number | undefined =
            hit.publishedDate != null ? new Date(hit.publishedDate).getTime() : undefined;
          if (publishedAt != null && Number.isNaN(publishedAt)) publishedAt = undefined;
          collectedItems.push({
            watchTargetId,
            externalId,
            title: hit.title ?? url ?? "Exa result",
            url,
            abstract: hit.text,
            publishedAt,
            metadata: hit.publishedDate != null ? { publishedDate: hit.publishedDate } : {},
          });
        }
      }
      return { count: results.length, totalCollected: collectedItems.length, message: `Found ${results.length} results.` };
    },
  });

  const targetSummary = context.targets
    .map(
      (t) =>
        `- ${t.displayName} (name: ${t.name}, aliases: ${(t.aliases ?? []).join(", ") || "—"})`
    )
    .join("\n");

  const systemPrompt = `You are an Exa search specialist for biopharma competitive intelligence. Your mission: ${context.mission}

Watch targets:
${targetSummary}

Use the searchExa tool with queries that combine watch target names/aliases with scope (e.g. clinical trial, pipeline, FDA). Call the tool multiple times with different queries to cover each target.`;

  try {
    await generateText({
      model: openai("gpt-4o-mini"),
      tools: { searchExa },
      maxSteps,
      system: systemPrompt,
      prompt: "Run Exa searches for the watch targets above. Use multiple queries if needed.",
    });
  } catch {
    // Return what we collected
  }

  return { items: collectedItems };
}
