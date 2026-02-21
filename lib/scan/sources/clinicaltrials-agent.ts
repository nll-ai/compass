/**
 * ClinicalTrials.gov source agent: uses Vercel AI SDK with searchClinicalTrials tool (Zod params)
 * for agentic search with query expansion.
 */

import { generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { RawItemInput, ScanTarget, SourceResult } from "../types";
import type { SourceAgentContext } from "../agent-context";
import { fetchWithRetry } from "../fetchWithRetry";

function assignWatchTargetId(term: string, targets: ScanTarget[]): ScanTarget["_id"] {
  const t = term.toLowerCase();
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
 * Run the ClinicalTrials source agent: receives orchestrator context, performs agentic search
 * via searchClinicalTrials tool (Zod params), multi-step. Returns SourceResult.
 */
export async function runClinicalTrialsAgent(
  context: SourceAgentContext,
  options: { maxSteps?: number } = {}
): Promise<SourceResult> {
  const { maxSteps = 5 } = options;
  if (!context.env.OPENAI_API_KEY || context.targets.length === 0) return { items: [] };

  const collectedItems: RawItemInput[] = [];
  const seenNctIds = new Set<string>();

  const searchClinicalTrials = tool({
    description:
      "Search ClinicalTrials.gov API v2 for studies. queryTerm: search string (e.g. drug name, condition, NCT id). pageSize: max results (default 15). Returns studies with nctId, briefTitle, startDate.",
    parameters: z.object({
      queryTerm: z.string().describe("Search term: drug name, target, condition, or trial identifier"),
      pageSize: z.number().min(1).max(50).default(15).describe("Max number of studies to return"),
    }),
    execute: async ({ queryTerm, pageSize }) => {
      const url = `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(queryTerm.trim())}&pageSize=${pageSize}`;
      const res = await fetchWithRetry(url);
      if (!res.ok) return { count: 0, message: `ClinicalTrials: ${res.status}` };
      const data = (await res.json()) as {
        studies?: Array<{
          protocolSection?: {
            identificationModule?: { nctId?: string; briefTitle?: string };
            statusModule?: { startDateStruct?: { date?: string }; overallStatus?: string };
            descriptionModule?: { briefSummary?: string };
            designModule?: { phases?: string[] };
          };
        }>;
      };
      const studies = data.studies ?? [];
      const watchTargetId = assignWatchTargetId(queryTerm, context.targets);
      for (const study of studies) {
        const protocol = study.protocolSection;
        const nctId = protocol?.identificationModule?.nctId ?? "";
        const title = protocol?.identificationModule?.briefTitle ?? nctId;
        const startDate = protocol?.statusModule?.startDateStruct?.date;
        const overallStatus = protocol?.statusModule?.overallStatus;
        const briefSummary = (protocol?.descriptionModule?.briefSummary ?? "").trim();
        const phases = protocol?.designModule?.phases ?? [];
        let publishedAt: number | undefined = startDate ? new Date(startDate).getTime() : undefined;
        if (publishedAt != null && Number.isNaN(publishedAt)) publishedAt = undefined;
        if (!nctId || seenNctIds.has(nctId)) continue;
        seenNctIds.add(nctId);
        const abstractParts: string[] = [];
        if (overallStatus) abstractParts.push(overallStatus.replace(/_/g, " "));
        if (phases.length > 0) abstractParts.push(phases.map((p) => p.replace(/_/g, " ")).join(", "));
        if (briefSummary) abstractParts.push(briefSummary.length > 420 ? briefSummary.slice(0, 420).trim() + "…" : briefSummary);
        const abstract = abstractParts.length > 0 ? abstractParts.join(". ") : undefined;
        collectedItems.push({
          watchTargetId,
          externalId: nctId,
          title,
          url: `https://clinicaltrials.gov/study/${nctId}`,
          abstract: abstract || undefined,
          publishedAt,
          metadata: startDate != null ? { startDate, overallStatus } : overallStatus != null ? { overallStatus } : {},
        });
      }
      return { count: studies.length, totalCollected: collectedItems.length, message: `Found ${studies.length} studies.` };
    },
  });

  const targetSummary = context.targets
    .map(
      (t) =>
        `- ${t.displayName} (name: ${t.name}, aliases: ${(t.aliases ?? []).join(", ") || "—"}, indication: ${t.indication ?? "—"})`
    )
    .join("\n");

  const systemPrompt = `You are a clinical trials search specialist for biopharma competitive intelligence. Your mission: ${context.mission}

Watch targets:
${targetSummary}

Use the searchClinicalTrials tool with query terms from each watch target (drug name, target, condition). Call the tool multiple times with different terms to cover each target.`;

  try {
    await generateText({
      model: openai("gpt-4o-mini"),
      tools: { searchClinicalTrials },
      maxSteps,
      system: systemPrompt,
      prompt: "Run clinical trial searches for the watch targets above. Use multiple queries if needed.",
    });
  } catch {
    // Return what we collected
  }

  return { items: collectedItems };
}
