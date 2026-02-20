import type { Id } from "../../convex/_generated/dataModel";

export type SourceName = "pubmed" | "clinicaltrials" | "edgar" | "exa" | "openfda" | "rss" | "patents";

export interface ScanTarget {
  _id: Id<"watchTargets">;
  name: string;
  displayName: string;
  aliases: string[];
}

export interface RawItemInput {
  watchTargetId: Id<"watchTargets">;
  externalId: string;
  title: string;
  url: string;
  abstract?: string;
  fullText?: string;
  publishedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface SourceResult {
  items: RawItemInput[];
  error?: string;
}
