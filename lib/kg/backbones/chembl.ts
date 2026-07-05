/**
 * ChEMBL REST backbone — normalize a DRUG (molecule) and find its mechanism/targets.
 * Unauthenticated, CC-BY-SA. Best-effort: returns null on any failure.
 */

import { fetchWithRetry } from "../../scan/fetchWithRetry";

const CHEMBL = "https://www.ebi.ac.uk/chembl/api/data";

export interface ChEMBLMolecule {
  chemblId: string;
  name: string;
  maxPhase: number;
  synonyms: string[];
}

/** A clinical drug targeting a protein (via ChEMBL drug_mechanism), with its max phase. */
export interface ChEMBLDrug {
  chemblId: string;
  name: string;
  maxPhase: number;
}

/** Clinical drugs targeting a protein, resolved via the protein's UniProt accession. */
export async function fetchTargetDrugsByUniprot(uniprotAccession: string): Promise<ChEMBLDrug[]> {
  const acc = uniprotAccession.trim();
  if (!acc) return [];

  // 1. UniProt accession → ChEMBL target id.
  const tRes = await fetchWithRetry(
    `${CHEMBL}/target.json?target_components__accession=${encodeURIComponent(acc)}&limit=1`,
    { headers: { Accept: "application/json" } },
  ).catch(() => null);
  if (!tRes || !tRes.ok) return [];
  const tData = await tRes.json().catch(() => null);
  const targetId = (tData?.targets ?? [])[0]?.target_chembl_id;
  if (!targetId) return [];

  // 2. drug_mechanism by target → molecule ids.
  const dmRes = await fetchWithRetry(
    `${CHEMBL}/drug_mechanism.json?target_chembl_id=${encodeURIComponent(targetId)}&limit=25`,
    { headers: { Accept: "application/json" } },
  ).catch(() => null);
  if (!dmRes || !dmRes.ok) return [];
  const dmData = await dmRes.json().catch(() => null);
  const molIds: string[] = Array.from(
    new Set(
      (dmData?.drug_mechanisms ?? [])
        .map((d: any) => d?.molecule_chembl_id)
        .filter((x: any): x is string => typeof x === "string"),
    ),
  );
  if (molIds.length === 0) return [];

  // 3. molecule batch → names / phases.
  const mRes = await fetchWithRetry(
    `${CHEMBL}/molecule.json?molecule_chembl_id__in=${molIds.slice(0, 25).join(",")}&limit=25`,
    { headers: { Accept: "application/json" } },
  ).catch(() => null);
  if (!mRes || !mRes.ok) return [];
  const mData = await mRes.json().catch(() => null);
  const byId = new Map<string, any>(
    (mData?.molecules ?? []).map((m: any) => [m?.molecule_chembl_id, m]),
  );
  const out: ChEMBLDrug[] = [];
  for (const id of molIds) {
    const m = byId.get(id);
    if (!m) continue;
    out.push({
      chemblId: id,
      name: m?.pref_name || id,
      maxPhase: typeof m?.max_phase === "number" ? m.max_phase : -1,
    });
  }
  return out;
}

/** Search ChEMBL for a molecule (drug) by name; prefer a molecule with a development phase. */
export async function searchMolecule(query: string): Promise<ChEMBLMolecule | null> {
  const q = query.trim();
  if (!q) return null;
  const url = `${CHEMBL}/molecule.json?molecule_synonyms__molecule_synonym__iexact=${encodeURIComponent(q)}&limit=5`;
  let res: Response;
  try {
    res = await fetchWithRetry(url, { headers: { Accept: "application/json" } });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const molecules: any[] = data?.molecules ?? [];
  if (molecules.length === 0) return null;
  const pick =
    molecules.find((m) => (m?.max_phase ?? 0) >= 1) ?? molecules[0];
  const chemblId: string | undefined = pick?.molecule_chembl_id;
  if (!chemblId) return null;
  const syn = pick?.molecule_synonyms ?? [];
  const synonyms: string[] = [
    pick?.pref_name,
    ...syn.map((s: any) => s?.molecule_synonym),
  ].filter((x): x is string => typeof x === "string" && x.length > 0);
  return {
    chemblId,
    name: pick?.pref_name || synonyms[0] || chemblId,
    maxPhase: typeof pick?.max_phase === "number" ? pick.max_phase : -1,
    synonyms: Array.from(new Set(synonyms)),
  };
}
