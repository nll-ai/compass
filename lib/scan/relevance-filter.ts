/**
 * Relevance filter: keep only raw items that clearly help answer what the user
 * wants to monitor for each watch target. Items that are obviously unrelated
 * are dropped so they never appear in the UI.
 */

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { RawItemInput } from "./types";
import type { ScanTarget } from "./types";

const BATCH_SIZE = 12;

function monitoringGoal(target: ScanTarget): string {
  const notes = (target.notes ?? "").trim();
  return notes || `general updates about ${target.displayName} (trials, filings, pipeline, news)`;
}

function snippet(item: RawItemInput): string {
  const text = (item.abstract ?? item.fullText ?? "").trim();
  return text ? text.slice(0, 350).trim() : "";
}

const RelevanceSchema = z.object({
  relevant: z.array(z.boolean()).describe("One boolean per item: true only if the item clearly helps answer the monitoring goal for that target"),
});

/**
 * Filter to items that are relevant to the watch target's monitoring goal.
 * Uses the target's "what to monitor" (notes); if missing, uses a general goal.
 * Unrelated items are dropped and never surfaced.
 */
export async function filterRelevantItems(
  items: RawItemInput[],
  targets: ScanTarget[],
  openaiKey: string | undefined
): Promise<RawItemInput[]> {
  if (items.length === 0 || !openaiKey) return items;
  const targetById = new Map(targets.map((t) => [t._id, t]));

  const keepByIndex = new Map<number, boolean>();
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    const batch = items.slice(start, start + BATCH_SIZE);
    const goals = batch.map((item) => {
      const t = targetById.get(item.watchTargetId);
      return t ? monitoringGoal(t) : "general updates";
    });
    const lines = batch.map(
      (item, i) =>
        `[${i}] Goal: ${goals[i]}\nTitle: ${item.title}\n${snippet(item) ? `Snippet: ${snippet(item)}` : ""}`
    );
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: RelevanceSchema,
      prompt: `You are filtering items for a competitive intelligence digest. For each item below, the "Goal" is what the user wants to monitor for this watch target. Answer whether this item clearly helps answer that goal (e.g. trial result, discontinuation, pipeline change, competitor move). If the item is only tangentially related, generic, or obviously unrelated (e.g. wrong company, unrelated drug, off-topic), answer false. Be strict: when in doubt, false. Output one boolean per item in the same order.

Items:
${lines.join("\n\n")}`,
    });
    const relevant = object.relevant ?? [];
    batch.forEach((_, i) => keepByIndex.set(start + i, relevant[i] === true));
  }

  return items.filter((_, i) => keepByIndex.get(i) === true);
}
