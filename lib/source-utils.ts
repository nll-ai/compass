import type { SourceType } from "./types";

export function sourceLabel(source: SourceType): string {
  const labels: Record<SourceType, string> = {
    pubmed: "PubMed",
    clinicaltrials: "ClinicalTrials.gov",
    edgar: "SEC EDGAR",
    exa: "Exa AI",
    openfda: "openFDA",
    rss: "RSS",
  };
  return labels[source];
}
