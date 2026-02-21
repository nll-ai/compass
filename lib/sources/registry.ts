/**
 * Single source of truth for all data sources.
 * Add new sources here and wire a runner in lib/scan/sources/index.ts.
 */
export const SOURCE_REGISTRY = [
  { id: "exa", label: "Exa AI" },
  { id: "pubmed", label: "PubMed" },
  { id: "edgar", label: "SEC EDGAR (10-K, 10-Q, 8-K)" },
  { id: "patents", label: "Patents" },
  { id: "clinicaltrials", label: "ClinicalTrials.gov" },
  { id: "openfda", label: "openFDA" },
  { id: "rss", label: "RSS" },
] as const;

export type SourceId = (typeof SOURCE_REGISTRY)[number]["id"];

export const ALL_SOURCE_IDS: readonly SourceId[] = SOURCE_REGISTRY.map((s) => s.id);

export function getSourceLabel(id: SourceId): string {
  const entry = SOURCE_REGISTRY.find((s) => s.id === id);
  return entry?.label ?? id;
}
