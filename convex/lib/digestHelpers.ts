/** Helpers for building digest items (used by generate action). */

function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function synthesisEquivalentToHeadline(headline: string, synthesis: string): boolean {
  const h = normalizeForCompare(headline);
  const t = normalizeForCompare(synthesis);
  if (h === t) return true;
  if (h.length < 10 || t.length < 10) return false;
  const hWords = new Set(h.split(/\s+/).filter(Boolean));
  const tWords = new Set(t.split(/\s+/).filter(Boolean));
  const overlap = [...hWords].filter((w) => tWords.has(w)).length;
  const unionSize = new Set([...hWords, ...tWords]).size;
  if (unionSize === 0) return false;
  const jaccard = overlap / unionSize;
  if (jaccard >= 0.85) return true;
  const shorter = h.length <= t.length ? h : t;
  const longer = h.length <= t.length ? t : h;
  if (longer.includes(shorter) && longer.length - shorter.length < 50) return true;
  return false;
}

export function categoryForSource(source: string): "trial_update" | "publication" | "regulatory" | "filing" | "news" | "conference" {
  const m: Record<string, "trial_update" | "publication" | "regulatory" | "filing" | "news" | "conference"> = {
    edgar: "filing",
    pubmed: "publication",
    clinicaltrials: "trial_update",
    exa: "news",
    openfda: "regulatory",
    rss: "news",
    patents: "publication",
  };
  return m[source] ?? "news";
}
