/**
 * Open Targets Platform GraphQL backbone — given a target (Ensembl id), fetch its
 * high-confidence disease associations and known clinical drugs (with developer + phase
 * + disease). Unauthenticated, CC-BY. Best-effort: returns null/empty on any failure
 * (the OT GraphQL schema evolves; callers must tolerate partial results).
 */

import { fetchWithRetry } from "../../scan/fetchWithRetry";

const OT_GRAPHQL = "https://api.platform.opentargets.org/api/v4/graphql";

export interface OTDiseaseAssociation {
  diseaseId: string;
  diseaseName: string;
  score: number;
}

export interface OTKnownDrug {
  drugId: string;
  drugName: string;
  drugType?: string;
  phase: number;
  company?: string;
  diseaseId?: string;
  diseaseName?: string;
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetchWithRetry(OT_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.errors) return null;
    return (json?.data ?? null) as T | null;
  } catch {
    return null;
  }
}

/** Top disease associations for a target, ranked by overall score. */
export async function fetchDiseaseAssociations(
  ensemblId: string,
  size = 12,
): Promise<OTDiseaseAssociation[]> {
  const data = await gql<{ target?: { associatedDiseases?: { rows?: any[] } } }>(
    `query($ensemblId: String!, $size: Int!){
       target(ensemblId: $ensemblId){
         associatedDiseases(page: {index: 0, size: $size}){
           rows { disease { id name } score }
         }
       }
     }`,
    { ensemblId, size },
  );
  const rows = data?.target?.associatedDiseases?.rows ?? [];
  return rows
    .map((r) => ({
      diseaseId: r?.disease?.id ?? "",
      diseaseName: r?.disease?.name ?? "",
      score: typeof r?.score === "number" ? r.score : 0,
    }))
    .filter((d) => d.diseaseId && d.diseaseName);
}

/** Clinical-trail drugs for a target (name, developer, phase, disease). */
export async function fetchKnownDrugs(
  ensemblId: string,
  size = 25,
): Promise<OTKnownDrug[]> {
  const data = await gql<{ target?: { knownDrugs?: { rows?: any[] } } }>(
    `query($ensemblId: String!, $size: Int!){
       target(ensemblId: $ensemblId){
         knownDrugs(page: {index: 0, size: $size}){
           rows { drug { id name } drugType phase disease { id name } company }
         }
       }
     }`,
    { ensemblId, size },
  );
  const rows = data?.target?.knownDrugs?.rows ?? [];
  const seen = new Set<string>();
  const out: OTKnownDrug[] = [];
  for (const r of rows) {
    const drugId = r?.drug?.id ?? "";
    const drugName = r?.drug?.name ?? "";
    const company = typeof r?.company === "string" ? r.company : undefined;
    const key = `${drugId}|${company ?? ""}|${r?.disease?.id ?? ""}`;
    if (!drugId || !drugName || seen.has(key)) continue;
    seen.add(key);
    out.push({
      drugId,
      drugName,
      drugType: r?.drugType,
      phase: typeof r?.phase === "number" ? r.phase : -1,
      company,
      diseaseId: r?.disease?.id,
      diseaseName: r?.disease?.name,
    });
  }
  return out;
}
