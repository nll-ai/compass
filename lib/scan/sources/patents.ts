import type { ScanTarget, SourceResult } from "../types";

interface PatentsViewHit {
  patent_id?: string;
  patent_title?: string;
  patent_abstract?: string;
  patent_date?: string;
}

export async function runPatents(
  targets: ScanTarget[],
  env: { PATENTSVIEW_API_KEY?: string }
): Promise<SourceResult> {
  const apiKey = env.PATENTSVIEW_API_KEY;
  if (!apiKey) return { items: [] };

  const items: SourceResult["items"] = [];
  try {
    for (const target of targets) {
      const terms = [target.name, target.displayName, ...target.aliases]
        .slice(0, 3)
        .filter(Boolean)
        .join(" ");
      if (!terms.trim()) continue;

      const q = {
        _or: [
          { _text_any: { patent_title: terms } },
          { _text_any: { patent_abstract: terms } },
        ],
      };
      const params = new URLSearchParams({
        q: JSON.stringify(q),
        f: JSON.stringify(["patent_id", "patent_title", "patent_abstract", "patent_date"]),
        s: JSON.stringify([{ patent_date: "desc" }]),
        o: JSON.stringify({ size: 5 }),
      });
      const res = await fetch(
        `https://search.patentsview.org/api/v1/patent/?${params.toString()}`,
        {
          headers: {
            "X-Api-Key": apiKey,
            Accept: "application/json",
          },
        }
      );
      if (!res.ok) continue;
      const data = (await res.json()) as {
        patents?: PatentsViewHit[];
        error?: boolean;
      };
      const patents = data.patents ?? [];
      for (const p of patents) {
        const id = p.patent_id;
        if (!id) continue;
        const url = `https://patents.google.com/patent/US${id}`;
        items.push({
          watchTargetId: target._id,
          externalId: id,
          title: p.patent_title ?? `Patent ${id}`,
          url,
          abstract: p.patent_abstract,
          publishedAt: p.patent_date ? new Date(p.patent_date).getTime() : undefined,
          metadata: { patent_date: p.patent_date },
        });
      }
    }
    return { items };
  } catch (err) {
    return { items: [], error: err instanceof Error ? err.message : String(err) };
  }
}
