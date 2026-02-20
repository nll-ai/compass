import type { ScanTarget, SourceResult } from "../types";

export async function runExa(
  targets: ScanTarget[],
  env: { EXA_API_KEY?: string }
): Promise<SourceResult> {
  const apiKey = env.EXA_API_KEY;
  if (!apiKey) return { items: [] };
  const items: SourceResult["items"] = [];
  try {
    for (const target of targets) {
      const query = [target.name, ...target.aliases].slice(0, 3).join(" ");
      const res = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          query: `${query} biopharma drug development clinical`,
          numResults: 5,
          type: "auto",
          contents: { text: { maxCharacters: 500 } },
        }),
      });
      if (!res.ok) continue;
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
    return { items: [], error: err instanceof Error ? err.message : String(err) };
  }
}
