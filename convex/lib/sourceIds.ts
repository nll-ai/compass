/**
 * Source ids used for scan runs. Keep in sync with lib/sources/registry.ts ALL_SOURCE_IDS.
 */
export const ALL_SOURCE_IDS = [
  "exa",
  "pubmed",
  "edgar",
  "patents",
  "clinicaltrials",
  "openfda",
  "rss",
] as const;

export type SourceId = (typeof ALL_SOURCE_IDS)[number];
export const SOURCES_TOTAL = ALL_SOURCE_IDS.length;
