/**
 * openFDA source agent: uses Vercel AI SDK with tools (Zod params) for agentic search.
 * Minimal stub: tools defined for structured generation; real API integration can be added later.
 */

import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { createGroqModel, groqModelFastId } from "../../llm/groq";
import type { SourceResult } from "../types";
import type { SourceAgentContext } from "../agent-context";

/**
 * Run the openFDA source agent: receives orchestrator context, performs agentic search
 * via searchOpenFDA tool (Zod params). Stub implementation returns empty; wire openFDA API as needed.
 */
export async function runOpenFdaAgent(
  context: SourceAgentContext,
  options: { maxSteps?: number } = {}
): Promise<SourceResult> {
  const { maxSteps = 3 } = options;
  const groqKey = context.env.GROQ_API_KEY;
  if (!groqKey || context.targets.length === 0) return { items: [] };

  const searchOpenFDA = tool({
    description:
      "Search openFDA for drug labels, adverse events, or other endpoints. query: search term (e.g. drug name). endpoint: one of 'drug/label', 'food/event' (adverse events), etc. limit: max results.",
    inputSchema: z.object({
      query: z.string().describe("Search query (e.g. drug name, active ingredient)"),
      endpoint: z.string().optional().describe("API endpoint path (e.g. drug/label.json)"),
      limit: z.number().min(1).max(100).default(10).describe("Max results"),
    }),
    execute: async () => {
      return { count: 0, message: "openFDA integration not yet implemented; tool call recorded." };
    },
  });

  const targetSummary = context.targets
    .map((t) => `- ${t.displayName} (name: ${t.name})`)
    .join("\n");

  const systemPrompt = `You are an openFDA search specialist for biopharma competitive intelligence. Your mission: ${context.mission}

Watch targets:
${targetSummary}

openFDA provides drug labels, adverse events, and other data. Use the searchOpenFDA tool with query terms from the watch targets.`;

  try {
    await generateText({
      model: createGroqModel(groqModelFastId(), groqKey),
      tools: { searchOpenFDA },
      stopWhen: stepCountIs(maxSteps),
      system: systemPrompt,
      prompt: "Consider running openFDA searches for the watch targets. (API not yet wired; tool is a stub.)",
    });
  } catch {
    // Return empty
  }

  return { items: [] };
}
