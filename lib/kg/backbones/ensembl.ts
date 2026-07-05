/**
 * Ensembl REST backbone — resolve a gene symbol/name to its Ensembl gene id (ENSG…).
 * The authoritative source for ENSG ids (UniProt xrefs are often transcripts/proteins).
 * Unauthenticated. Best-effort: returns null on any failure.
 */

import { fetchWithRetry } from "../../scan/fetchWithRetry";

const ENSEMBL = "https://rest.ensembl.org";

export async function resolveGeneId(symbol: string): Promise<string | null> {
  const q = symbol.trim();
  if (!q) return null;
  const url = `${ENSEMBL}/xrefs/symbol/homo_sapiens/${encodeURIComponent(
    q,
  )}?content-type=application/json&object_type=gene`;
  let res: Response;
  try {
    res = await fetchWithRetry(url, { headers: { Accept: "application/json" } });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const arr: any[] = Array.isArray(data) ? data : [];
  const gene = arr.find((x) => typeof x?.id === "string" && x.id.startsWith("ENSG"));
  return gene?.id ?? null;
}
