/**
 * UniProt REST backbone — normalize a biological target (symbol/name) to a reviewed
 * (Swiss-Prot) entry: accession, gene symbol, Ensembl cross-ref, protein name, function.
 * Unauthenticated, CC-BY. Best-effort: returns null on any failure.
 */

import { fetchWithRetry } from "../../scan/fetchWithRetry";
import type { ExternalRefs } from "../types";

const UNIPROT = "https://rest.uniprot.org/uniprotkb";

export interface UniProtEntry {
  accession: string;
  displayName: string;
  geneSymbol?: string;
  ensembl?: string;
  aliases: string[];
  summary?: string;
}

function pickField(obj: any, ...path: Array<string | number>): any {
  let cur: any = obj;
  for (const k of path) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

function parseEntry(r: any): UniProtEntry | null {
  const accession: string | undefined = r?.primaryAccession;
  if (!accession) return null;
  const proteinName: string | undefined =
    pickField(r, "proteinDescription", "recommendedName", "fullName", "value") ??
    pickField(r, "proteinDescription", "submittedNames", 0, "fullName", "value");
  const genes: any[] = r?.genes ?? [];
  const geneSymbol: string | undefined = genes[0]?.geneName?.value;
  const altGeneSymbols: string[] = genes
    .flatMap((g) => [g?.geneName?.value, ...(g?.synonyms ?? []).map((s: any) => s?.value)])
    .filter((x): x is string => typeof x === "string" && x.length > 0);
  const xrefs: any[] = r?.uniProtKBCrossReferences ?? [];
  const ensembl: string | undefined = xrefs.find((x) => x?.database === "Ensembl")?.id;
  const funcComment: any = (r?.comments ?? []).find((c: any) => c?.commentType === "FUNCTION");
  const summary: string | undefined =
    funcComment && Array.isArray(funcComment.texts)
      ? funcComment.texts.map((t: any) => t?.value).filter(Boolean).join(" ")
      : undefined;

  const aliases = Array.from(new Set([...altGeneSymbols, proteinName].filter((x): x is string => !!x)));
  return {
    accession,
    displayName: proteinName || geneSymbol || accession,
    geneSymbol,
    ensembl,
    aliases,
    summary: summary?.slice(0, 600),
  };
}

/** Search UniProt for a target symbol/name; prefer a reviewed Swiss-Prot entry. */
export async function searchTarget(query: string): Promise<UniProtEntry | null> {
  const q = query.trim();
  if (!q) return null;
  const term = `(${q}) AND (reviewed:true)`;
  const url = `${UNIPROT}/search?query=${encodeURIComponent(term)}&format=json&size=5`;
  let res: Response;
  try {
    res = await fetchWithRetry(url, { headers: { Accept: "application/json" } });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const results: any[] = data?.results ?? [];
  if (results.length === 0) return null;
  const lower = q.toLowerCase();
  const match =
    results.find((r) => (r?.genes ?? []).some((g: any) => g?.geneName?.value?.toLowerCase() === lower)) ??
    results.find((r) => String(r?.primaryAccession).toLowerCase() === lower) ??
    results[0];
  return parseEntry(match);
}

export function uniprotRefs(entry: UniProtEntry): ExternalRefs {
  const refs: ExternalRefs = { uniprot: entry.accession };
  if (entry.ensembl) refs.ensembl = entry.ensembl;
  return refs;
}
