import type { ScanTarget, SourceResult, ScanOptions } from "../types";
import { fetchWithRetry } from "../fetchWithRetry";

function getPageSize(options?: ScanOptions): number {
  return options?.mode === "comprehensive" ? 25 : 5;
}

export async function runClinicalTrials(
  targets: ScanTarget[],
  _env: Record<string, string | undefined>,
  options?: ScanOptions
): Promise<SourceResult> {
  const items: SourceResult["items"] = [];
  const pageSize = getPageSize(options);

  try {
    for (const target of targets) {
      const query = [target.name, ...target.aliases].slice(0, 3).join(" ");
      const url = `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(query)}&pageSize=${pageSize}`;
      const res = await fetchWithRetry(url);
      if (!res.ok) {
        if (items.length > 0) {
          return { items, error: `ClinicalTrials: ${res.status}` };
        }
        return { items: [], error: `ClinicalTrials: ${res.status}` };
      }
      const data = (await res.json()) as {
        studies?: Array<{
          protocolSection?: { identificationModule?: { nctId?: string; briefTitle?: string } };
        }>;
      };
      const studies = data.studies ?? [];
      for (const study of studies) {
        const nctId = study.protocolSection?.identificationModule?.nctId ?? "";
        const title = study.protocolSection?.identificationModule?.briefTitle ?? nctId;
        if (!nctId) continue;
        items.push({
          watchTargetId: target._id,
          externalId: nctId,
          title,
          url: `https://clinicaltrials.gov/study/${nctId}`,
          metadata: {},
        });
      }
    }
    return { items };
  } catch (err) {
    return { items, error: err instanceof Error ? err.message : String(err) };
  }
}
