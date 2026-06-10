import type { RawItemInput, SourceResult } from "../types";
import type { SourceAgentContext } from "../agent-context";
import { fetchWithRetry } from "../fetchWithRetry";
import { runClinicalTrialsAgent } from "./clinicaltrials-agent";
import { DEFAULT_LOOKBACK_DAYS } from "../lookback";

const PROCEDURAL_PAGE_SIZE = 15;

const CT_API_BASE = "https://clinicaltrials.gov/api/v2/studies";

function ctDateRangeFilterParam(lookbackDays: number): string {
  const safe = Math.max(1, lookbackDays);
  const now = new Date();
  const start = new Date(now.getTime() - safe * 86_400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return `AREA[LastUpdatePostDate]RANGE[${fmt(start)},MAX]`;
}

function parseDateToEpoch(dateStr: string | undefined): number | undefined {
  if (!dateStr) return undefined;
  const ms = new Date(dateStr).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

function extractPublishedAt(statusModule?: {
  lastUpdatePostDateStruct?: { date?: string };
  studyFirstPostDateStruct?: { date?: string };
  startDateStruct?: { date?: string };
}): number | undefined {
  if (!statusModule) return undefined;
  return (
    parseDateToEpoch(statusModule.lastUpdatePostDateStruct?.date) ??
    parseDateToEpoch(statusModule.studyFirstPostDateStruct?.date) ??
    parseDateToEpoch(statusModule.startDateStruct?.date)
  );
}

async function fetchClinicalTrialsProcedural(
  queryTerm: string,
  watchTargetId: RawItemInput["watchTargetId"],
  lookbackDays: number,
): Promise<RawItemInput[]> {
  const params = new URLSearchParams({
    "query.term": queryTerm.trim(),
    pageSize: String(PROCEDURAL_PAGE_SIZE),
  });
  if (lookbackDays > 0) {
    params.set("filter.advanced", ctDateRangeFilterParam(lookbackDays));
  }
  const url = `${CT_API_BASE}?${params.toString()}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    studies?: Array<{
      protocolSection?: {
        identificationModule?: { nctId?: string; briefTitle?: string };
        statusModule?: {
          lastUpdatePostDateStruct?: { date?: string };
          studyFirstPostDateStruct?: { date?: string };
          startDateStruct?: { date?: string };
        };
      };
    }>;
  };
  const studies = data.studies ?? [];
  const items: RawItemInput[] = [];
  for (const study of studies) {
    const nctId = study.protocolSection?.identificationModule?.nctId ?? "";
    const title = study.protocolSection?.identificationModule?.briefTitle ?? nctId;
    const statusModule = study.protocolSection?.statusModule;
    const publishedAt = extractPublishedAt(statusModule);
    const startDate = statusModule?.startDateStruct?.date;
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

async function runClinicalTrialsProceduralPath(context: SourceAgentContext): Promise<SourceResult> {
  const items: RawItemInput[] = [];
  const lookbackDays = context.scanOptions?.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;

  for (const target of context.targets) {
    const query = [target.name, target.displayName, ...(target.aliases ?? [])]
      .filter(Boolean)
      .map((s) => s.trim())
      .find((s) => s.length >= 2);
    if (!query) continue;
    const procedural = await fetchClinicalTrialsProcedural(query, target._id, lookbackDays);
    items.push(...procedural);
  }
  return { items };
}

export async function runClinicalTrials(context: SourceAgentContext): Promise<SourceResult> {
  if (context.targets.length === 0) return { items: [] };

  try {
    // Agent in charge: run agentic search first (LLM + tools).
    const agentResult =
      context.env.GROQ_API_KEY
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
