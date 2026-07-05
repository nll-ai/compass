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
