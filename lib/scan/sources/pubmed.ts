import type { ScanTarget, SourceResult, ScanOptions, TherapeuticArea } from "../types";
import { fetchWithRetry, sleep } from "../fetchWithRetry";

/** PubMed: 3/sec without key, 10/sec with API key. Throttle ~100–350ms between requests in comprehensive. */
const THROTTLE_MS_COMPREHENSIVE = 200;

/** Human/biopharma scope terms so we don't get plant or agricultural hits (e.g. NPR1 in rice). */
function scopeForTherapeuticArea(area?: TherapeuticArea): string {
  const human = "human OR humans OR clinical OR drug OR therapy OR patient";
  if (area === "cardiovascular") return `(${human} OR cardiovascular OR heart OR natriuretic OR hypertension OR heart failure)`;
  if (area === "oncology") return `(${human} OR cancer OR oncology OR tumor OR carcinoma)`;
  return `(${human})`;
}

function getRetmax(options?: ScanOptions): number {
  return options?.mode === "comprehensive" ? 40 : 5;
}

function buildPubmedQuery(target: ScanTarget): string {
  const baseTerms = [target.name, ...target.aliases].slice(0, 5).filter(Boolean);
  const learnedTerms = (target.learnedQueryTerms ?? []).slice(0, 5);
  const terms = [...baseTerms, ...learnedTerms].map((t) => t.trim()).filter(Boolean);
  if (terms.length === 0) return "";
  const core = terms.join(" OR ");
  const scope = scopeForTherapeuticArea(target.therapeuticArea);
  const excludeTerms = (target.excludeQueryTerms ?? []).map((t) => t.trim()).filter(Boolean);
  const notClause = excludeTerms.length > 0 ? ` NOT (${excludeTerms.join(" OR ")})` : "";
  return `(${core}) AND ${scope}${notClause}`;
}

export async function runPubmed(
  targets: ScanTarget[],
  env: { PUBMED_API_KEY?: string },
  options?: ScanOptions
): Promise<SourceResult> {
  const apiKey = env.PUBMED_API_KEY;
  const items: SourceResult["items"] = [];
  const retmax = getRetmax(options);
  const throttleMs = options?.mode === "comprehensive" ? THROTTLE_MS_COMPREHENSIVE : 0;

  try {
    for (const target of targets) {
      if (throttleMs > 0) await sleep(throttleMs);
      const query = buildPubmedQuery(target);
      if (!query) continue;
      const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${retmax}&retmode=json${apiKey ? `&api_key=${apiKey}` : ""}`;
      const searchRes = await fetchWithRetry(searchUrl);
      if (!searchRes.ok) {
        if (items.length > 0) {
          return { items, error: `PubMed esearch: ${searchRes.status}` };
        }
        return { items: [], error: `PubMed esearch: ${searchRes.status}` };
      }
      if (throttleMs > 0) await sleep(throttleMs);
      const searchData = (await searchRes.json()) as { esearchresult?: { idlist?: string[] } };
      const idlist = searchData.esearchresult?.idlist ?? [];
      if (idlist.length === 0) continue;

      const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${idlist.join(",")}&retmode=json${apiKey ? `&api_key=${apiKey}` : ""}`;
      const summaryRes = await fetchWithRetry(summaryUrl);
      if (!summaryRes.ok) {
        if (items.length > 0) {
          return { items, error: `PubMed esummary: ${summaryRes.status}` };
        }
        return { items: [], error: `PubMed esummary: ${summaryRes.status}` };
      }
      const summaryData = (await summaryRes.json()) as {
        result?: Record<string, { title?: string; pubdate?: string; sortpubdate?: string }>;
      };
      const result = summaryData.result ?? {};

      // Fetch abstracts so we can show "content from original page" in the UI
      let abstractByPmid: Record<string, string> = {};
      if (idlist.length > 0) {
        if (throttleMs > 0) await sleep(throttleMs);
        const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${idlist.join(",")}&rettype=abstract&retmode=text${apiKey ? `&api_key=${apiKey}` : ""}`;
        const fetchRes = await fetchWithRetry(fetchUrl);
        if (fetchRes.ok) {
          const text = await fetchRes.text();
          const blocks = text.split(/\n\nPMID: (\d+) \[Indexed for MEDLINE\]/);
          for (let i = 1; i < blocks.length; i += 2) {
            const pmid = blocks[i];
            const block = blocks[i - 1]?.trim() ?? "";
            if (pmid && block) abstractByPmid[pmid] = block;
          }
        }
      }

      for (const pmid of idlist) {
        const entry = result[pmid];
        const title = entry?.title?.trim() || `PubMed ${pmid}`;
        const pubdate = entry?.pubdate;
        const sortpubdate = entry?.sortpubdate;
        let publishedAt: number | undefined =
          sortpubdate != null ? new Date(sortpubdate.replace(" ", "T")).getTime() : undefined;
        if (publishedAt != null && Number.isNaN(publishedAt)) publishedAt = undefined;
        items.push({
          watchTargetId: target._id,
          externalId: pmid,
          title,
          url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
          abstract: abstractByPmid[pmid],
          publishedAt,
          metadata: pubdate != null ? { pubdate } : {},
        });
      }
    }
    return { items };
  } catch (err) {
    return { items, error: err instanceof Error ? err.message : String(err) };
  }
}
