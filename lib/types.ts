export type Significance = "critical" | "high" | "medium" | "low";
export type DigestCategory =
  | "trial_update"
  | "publication"
  | "regulatory"
  | "filing"
  | "news"
  | "conference";
export type SourceType = "pubmed" | "clinicaltrials" | "edgar" | "exa" | "openfda" | "rss" | "patents";
export type TherapeuticArea = "cardiovascular" | "oncology" | "other";

export type TargetLookupResult = {
  name: string;
  displayName: string;
  aliases: string[];
  type: "drug" | "target" | "company";
  therapeuticArea: TherapeuticArea;
  indication?: string;
  company?: string;
};

export type WatchTarget = {
  _id: string;
  name: string;
  displayName: string;
  type: "drug" | "target" | "company";
  aliases: string[];
  indication?: string;
  company?: string;
  therapeuticArea: TherapeuticArea;
  active: boolean;
  notes?: string;
};

export type DigestSourceRef = {
  title: string;
  url: string;
  source: string;
  date?: string;
};

export type DigestItem = {
  _id: string;
  digestRunId: string;
  watchTargetId: string;
  category: DigestCategory;
  significance: Significance;
  headline: string;
  synthesis: string;
  strategicImplication?: string;
  sources: DigestSourceRef[];
  rawItemIds?: string[];
  reviewedAt?: number;
  feedback?: "good" | "bad";
  feedbackAt?: number;
};

export type DigestRun = {
  _id: string;
  period: "daily" | "weekly";
  generatedAt: number;
  executiveSummary: string;
  totalSignals: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
};

export type RawItem = {
  _id: string;
  scanRunId: string;
  watchTargetId: string;
  source: SourceType;
  externalId: string;
  title: string;
  url: string;
  abstract?: string;
  fullText?: string;
  publishedAt?: number;
  metadata: unknown;
  isNew: boolean;
};
