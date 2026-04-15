import { generateObject } from "ai";
import { z } from "zod";
import { createGroqModel, groqModelFastId } from "../../llm/groq";
import type { DiffSummaryModelOutput } from "./types";

const judgeSchema = z.object({
  faithfulness: z.number().min(0).max(5).describe("Grounding in before/after only; penalize invented facts."),
  materiality: z.number().min(0).max(5).describe("Focus on changes that matter for CI decisions."),
  concision: z.number().min(0).max(5).describe("No filler; appropriate length."),
  actionability: z.number().min(0).max(5).describe("Next steps are concrete when changes warrant them."),
});

export type JudgeDimensions = z.infer<typeof judgeSchema>;

export type JudgeScoreResult = JudgeDimensions & {
  /** Mean of four dimensions / 5 → 0..1 */
  judgeScore: number;
};

/**
 * Layer-3 rubric: LLM-as-judge on the generated diff summary (0–5 per dimension).
 */
export async function judgeDiffSummary(args: {
  beforeText: string;
  afterText: string;
  modelOutput: DiffSummaryModelOutput;
  rubricHint?: string;
  groqApiKey: string;
  model?: string;
}): Promise<JudgeScoreResult> {
  const modelId = args.model ?? groqModelFastId();
  const rubricBlock = args.rubricHint?.trim()
    ? `\n\nEvaluator rubric / gold notes (from expected_summary.md):\n${args.rubricHint.slice(0, 8000)}`
    : "";

  const { object } = await generateObject({
    model: createGroqModel(modelId, args.groqApiKey),
    schema: judgeSchema,
    system: `You score diff summaries for competitive-intelligence workflows. Use only the BEFORE and AFTER texts and the candidate summary. Each score is 0-5 integers.`,
    prompt: `BEFORE (excerpt):\n---\n${args.beforeText.slice(0, 60_000)}\n---\n\nAFTER (excerpt):\n---\n${args.afterText.slice(0, 60_000)}\n---\n\nCandidate summary (JSON):\n${JSON.stringify(args.modelOutput, null, 2)}${rubricBlock}`,
  });

  const judgeScore =
    (object.faithfulness + object.materiality + object.concision + object.actionability) / 20;

  return { ...object, judgeScore };
}
