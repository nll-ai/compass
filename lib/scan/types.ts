import type { Id } from "../../convex/_generated/dataModel";
import type { SourceId } from "../sources/registry";

/** @deprecated Use SourceId from lib/sources/registry instead. */
export type SourceName = SourceId;

export type ScanMode = "latest" | "comprehensive";

/** How PubMed `esearch` filters by publication date (`pdat`). Dates are applied server-side only. */
export type PubmedPubDateMode = "contemporaneous" | "unbounded" | "range";

export interface ScanOptions {
  mode: ScanMode;
  /**
   * Recency window for digest input and optional pre-upsert filtering (calendar days).
   * **0** = no limit (all time). Omitted in `ScanOptions` is normal; the pipeline sets this from the HTTP body (default **14** when omitted there).
   */
  lookbackDays?: number;
  /**
   * PubMed publication-date window for `esearch` (`mindate` / `maxdate` + `datetype=pdat`).
   * - **contemporaneous:** last N calendar years through today (UTC), NCBI `YYYY/MM/DD`.
   * **unbounded:** no date params (search full PubMed for the query).
   * **range:** explicit `mindate`/`maxdate` (NCBI `YYYY/MM/DD` or `YYYY-MM-DD`; normalized to slashes).
   */
  pubmedPubDate?: {
    mode: PubmedPubDateMode;
    /** Used when `mode` is `contemporaneous`; default 3. */
    years?: number;
    /** Inclusive bounds when `mode` is `range`. */
    mindate?: string;
    maxdate?: string;
  };
}

export type TherapeuticArea = "cardiovascular" | "oncology" | "other";

export interface ScanTarget {
  _id: Id<"watchTargets">;
  name: string;
  displayName: string;
  aliases: string[];
  therapeuticArea?: TherapeuticArea;
  type?: "drug" | "target" | "company" | "person";
  indication?: string;
  company?: string;
  /** What the user wants to monitor for this target (guides retrieval and relevance). */
  notes?: string;
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
