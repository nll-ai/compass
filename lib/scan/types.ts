import type { Id } from "../../convex/_generated/dataModel";
import type { SourceId } from "../sources/registry";

/** @deprecated Use SourceId from lib/sources/registry instead. */
export type SourceName = SourceId;

export type ScanMode = "latest" | "comprehensive";

export interface ScanOptions {
  mode: ScanMode;
}

export type TherapeuticArea = "cardiovascular" | "oncology" | "other";

export interface ScanTarget {
  _id: Id<"watchTargets">;
  name: string;
  displayName: string;
  aliases: string[];
  therapeuticArea?: TherapeuticArea;
  type?: "drug" | "target" | "company";
  indication?: string;
  company?: string;
  /** Phrases to add to search queries, derived from user feedback. */
  learnedQueryTerms?: string[];
  /** Terms to exclude from search, derived from user feedback. */
  excludeQueryTerms?: string[];
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
