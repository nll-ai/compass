import type { ScanTarget, SourceResult } from "../types";

export async function runPubmed(
  targets: ScanTarget[],
  env: { PUBMED_API_KEY?: string }
): Promise<SourceResult> {
  const apiKey = env.PUBMED_API_KEY;
  const items: SourceResult["items"] = [];
  try {
    for (const target of targets) {
      const query = [target.name, ...target.aliases].slice(0, 3).join(" OR ");
      const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=5&retmode=json${apiKey ? `&api_key=${apiKey}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = (await res.json()) as { esearchresult?: { idlist?: string[] } };
      const idlist = data.esearchresult?.idlist ?? [];
      for (const pmid of idlist) {
        items.push({
          watchTargetId: target._id,
          externalId: pmid,
          title: `PubMed ${pmid}`,
          url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
          metadata: {},
        });
      }
    }
    return { items };
  } catch (err) {
    return { items: [], error: err instanceof Error ? err.message : String(err) };
  }
}
