import { generateObject } from "ai";
import { z } from "zod";
import { createGroqModel, groqModelFastId } from "../../llm/groq";
import type { DiffSummaryModelOutput } from "./types";

const diffOutputSchema = z.object({
  deltaSummary: z.string().max(1200),
  materialitySummary: z.string().max(1200),
  recommendedActionsSummary: z.string().max(800),
  confidence: z.enum(["low", "medium", "high"]),
  extractedFacts: z.array(z.string()).max(20).optional(),
});

/**
 * Generate Decision-Digest-style diff summaries from two plaintext snapshots (offline eval).
 */
export async function runDiffSummaryFromTexts(args: {
  beforeText: string;
  afterText: string;
  groqApiKey: string;
  model?: string;
}): Promise<DiffSummaryModelOutput> {
  const modelId = args.model ?? groqModelFastId();
  const { object } = await generateObject({
    model: createGroqModel(modelId, args.groqApiKey),
    schema: diffOutputSchema,
    system: `You compare two text snapshots (before vs after) for competitive intelligence.
Only state what is supported by the texts. If changes are minor or unclear, use low confidence.
extractedFacts: short atomic strings (max 15) describing discrete changes.`,
    prompt: `BEFORE:\n---\n${args.beforeText.slice(0, 120_000)}\n---\n\nAFTER:\n---\n${args.afterText.slice(0, 120_000)}\n---`,
  });
  return object;
}
