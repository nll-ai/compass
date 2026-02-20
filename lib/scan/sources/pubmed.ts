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
      const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=5&retmode=json${apiKey ? `&api_key=${apiKey}` : ""}`;
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) continue;
      const searchData = (await searchRes.json()) as { esearchresult?: { idlist?: string[] } };
      const idlist = searchData.esearchresult?.idlist ?? [];
      if (idlist.length === 0) continue;

      const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${idlist.join(",")}&retmode=json${apiKey ? `&api_key=${apiKey}` : ""}`;
      const summaryRes = await fetch(summaryUrl);
      const summaryData = (await summaryRes.json()) as {
        result?: Record<string, { title?: string }>;
      };
      const result = summaryData.result ?? {};

      for (const pmid of idlist) {
        const title = result[pmid]?.title?.trim() || `PubMed ${pmid}`;
        items.push({
          watchTargetId: target._id,
          externalId: pmid,
          title,
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
