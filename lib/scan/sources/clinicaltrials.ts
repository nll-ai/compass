import type { ScanTarget, SourceResult } from "../types";

export async function runClinicalTrials(targets: ScanTarget[]): Promise<SourceResult> {
  const items: SourceResult["items"] = [];
  try {
    for (const target of targets) {
      const query = [target.name, ...target.aliases].slice(0, 3).join(" ");
      const url = `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(query)}&pageSize=5`;
      const res = await fetch(url);
      if (!res.ok) continue;
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
    return { items: [], error: err instanceof Error ? err.message : String(err) };
  }
}
