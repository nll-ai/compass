/**
 * RSS source agent: uses Vercel AI SDK with tools (Zod params) for agentic search.
 * Minimal stub: tools defined for structured generation; real feed fetching can be added later.
 */

import { generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { SourceResult } from "../types";
import type { SourceAgentContext } from "../agent-context";

/**
 * Run the RSS source agent: receives orchestrator context, performs agentic search
 * via fetchRssFeed tool (Zod params). Stub implementation returns empty; wire RSS parsing as needed.
 */
export async function runRssAgent(
  context: SourceAgentContext,
  options: { maxSteps?: number } = {}
): Promise<SourceResult> {
  const { maxSteps = 3 } = options;
  if (!context.env.OPENAI_API_KEY || context.targets.length === 0) return { items: [] };

  const fetchRssFeed = tool({
    description:
      "Fetch and search an RSS feed by URL. feedUrl: full URL of the RSS/Atom feed. filterQuery: optional keyword filter for titles/descriptions. maxItems: max entries to return.",
    parameters: z.object({
      feedUrl: z.string().url().describe("URL of the RSS or Atom feed"),
      filterQuery: z.string().optional().describe("Optional keyword filter for entries"),
      maxItems: z.number().min(1).max(50).default(15).describe("Max feed entries to return"),
    }),
    execute: async () => {
      return { count: 0, message: "RSS integration not yet implemented; tool call recorded." };
    },
  });

  const targetSummary = context.targets
    .map((t) => `- ${t.displayName} (name: ${t.name})`)
    .join("\n");

  const systemPrompt = `You are an RSS/feed search specialist for biopharma competitive intelligence. Your mission: ${context.mission}

Watch targets:
${targetSummary}

Use the fetchRssFeed tool to add feed URLs and optionally filter by keywords relevant to the watch targets.`;

  try {
    await generateText({
      model: openai("gpt-4o-mini"),
      tools: { fetchRssFeed },
      maxSteps,
      system: systemPrompt,
      prompt: "Consider fetching RSS feeds relevant to the watch targets. (RSS not yet wired; tool is a stub.)",
    });
  } catch {
    // Return empty
  }

  return { items: [] };
}
