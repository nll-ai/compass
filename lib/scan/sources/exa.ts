import type { ScanTarget, SourceResult, ScanOptions } from "../types";
import { fetchWithRetry } from "../fetchWithRetry";

function getNumResults(options?: ScanOptions): number {
  return options?.mode === "comprehensive" ? 18 : 5;
}

/** Scope Exa query to human/biopharma context; avoids plant/agricultural results. */
function scopeExaQuery(query: string, target: ScanTarget): string {
  const base = `${query} biopharma drug development clinical`;
  if (target.therapeuticArea === "cardiovascular") return `${base} cardiovascular heart human`;
  if (target.therapeuticArea === "oncology") return `${base} oncology cancer human`;
  return base;
}

export async function runExa(
  targets: ScanTarget[],
  env: { EXA_API_KEY?: string },
  options?: ScanOptions
): Promise<SourceResult> {
  const apiKey = env.EXA_API_KEY;
  if (!apiKey) return { items: [] };
  const items: SourceResult["items"] = [];
  const numResults = getNumResults(options);

  try {
    for (const target of targets) {
      const baseTerms = [target.name, ...target.aliases].slice(0, 3).join(" ");
      const learned = (target.learnedQueryTerms ?? []).slice(0, 5).join(" ");
      const query = learned ? `${baseTerms} ${learned}`.trim() : baseTerms;
      const res = await fetchWithRetry("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          query: scopeExaQuery(query, target),
          numResults,
          type: "auto",
          contents: { text: { maxCharacters: 500 } },
        }),
      });
      if (!res.ok) {
        if (items.length > 0) {
          return { items, error: `Exa: ${res.status}` };
        }
        return { items: [], error: `Exa: ${res.status}` };
      }
      const data = (await res.json()) as {
        results?: Array<{ id: string; title?: string; url?: string; text?: string }>;
      };
      const results = data.results ?? [];
      for (let i = 0; i < results.length; i++) {
        const hit = results[i];
        const externalId = hit.id ?? hit.url ?? `${target._id}-${i}`;
        items.push({
          watchTargetId: target._id,
          externalId,
          title: hit.title ?? hit.url ?? "Exa result",
          url: hit.url ?? "",
          abstract: hit.text,
          metadata: {},
        });
      }
    }
    return { items };
  } catch (err) {
    return { items, error: err instanceof Error ? err.message : String(err) };
  }
}
