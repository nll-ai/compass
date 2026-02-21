import type { RawItemInput, SourceResult } from "../types";
import type { SourceAgentContext } from "../agent-context";
import { fetchWithRetry } from "../fetchWithRetry";
import { runClinicalTrialsAgent } from "./clinicaltrials-agent";

const PROCEDURAL_PAGE_SIZE = 15;

/** One procedural API call to ClinicalTrials.gov; returns items for dedupe/merge. */
async function fetchClinicalTrialsProcedural(
  queryTerm: string,
  watchTargetId: RawItemInput["watchTargetId"]
): Promise<RawItemInput[]> {
  const url = `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(queryTerm.trim())}&pageSize=${PROCEDURAL_PAGE_SIZE}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    studies?: Array<{
      protocolSection?: {
        identificationModule?: { nctId?: string; briefTitle?: string };
        statusModule?: { startDateStruct?: { date?: string } };
      };
    }>;
  };
  const studies = data.studies ?? [];
  const items: RawItemInput[] = [];
  for (const study of studies) {
    const nctId = study.protocolSection?.identificationModule?.nctId ?? "";
    const title = study.protocolSection?.identificationModule?.briefTitle ?? nctId;
    const startDate = study.protocolSection?.statusModule?.startDateStruct?.date;
    let publishedAt: number | undefined = startDate ? new Date(startDate).getTime() : undefined;
    if (publishedAt != null && Number.isNaN(publishedAt)) publishedAt = undefined;
    if (!nctId) continue;
    items.push({
      watchTargetId,
      externalId: nctId,
      title,
      url: `https://clinicaltrials.gov/study/${nctId}`,
      publishedAt,
      metadata: startDate != null ? { startDate } : {},
    });
  }
  return items;
}

/**
 * Procedural ClinicalTrials.gov path: one API call per target (name/displayName/alias).
 * Used only as fallback when the agent returns no items.
 */
async function runClinicalTrialsProceduralPath(context: SourceAgentContext): Promise<SourceResult> {
  const items: RawItemInput[] = [];
  const seenNctIds = new Set<string>();

  for (const target of context.targets) {
    const query = [target.name, target.displayName, ...(target.aliases ?? [])]
      .filter(Boolean)
      .map((s) => s.trim())
      .find((s) => s.length >= 2);
    if (!query) continue;
    const procedural = await fetchClinicalTrialsProcedural(query, target._id);
    for (const item of procedural) {
      if (seenNctIds.has(item.externalId)) continue;
      seenNctIds.add(item.externalId);
      items.push(item);
    }
  }
  return { items };
}

export async function runClinicalTrials(context: SourceAgentContext): Promise<SourceResult> {
  if (context.targets.length === 0) return { items: [] };

  try {
    // Agent in charge: run agentic search first (LLM + tools).
    const agentResult =
      context.env.OPENAI_API_KEY
        ? await runClinicalTrialsAgent(context, { maxSteps: 5 })
        : { items: [] };

    if (agentResult.items.length > 0) {
      return agentResult;
    }

    // Fallback: when agent returns nothing, use procedural ClinicalTrials path.
    return await runClinicalTrialsProceduralPath(context);
  } catch (err) {
    return { items: [], error: err instanceof Error ? err.message : String(err) };
  }
}
