/**
 * Types for offline diff eval corpus cases (`eval/diff/cases/<id>/`).
 */

export type DiffEvalCaseMetadata = {
  source: string;
  difficulty?: string;
  change_types?: string[];
  date_window?: {
    before_start?: string;
    before_end?: string;
    after_start?: string;
    after_end?: string;
  };
  ground_truth_notes?: string;
};

export type ExpectedChanges = {
  /** Substrings that the generated summary should include (case-insensitive). */
  must_mention?: string[];
  /** Substrings that should not appear in the summary (case-insensitive). */
  must_not_mention?: string[];
  /**
   * Atomic facts that should be reflected in the summary or `extractedFacts` (case-insensitive substring match).
   * Used for fact recall vs corpus ground truth.
   */
  expected_facts?: string[];
};

export type DiffSummaryModelOutput = {
  deltaSummary: string;
  materialitySummary: string;
  recommendedActionsSummary: string;
  confidence: "low" | "medium" | "high";
  /** Short bullet list of extracted change facts (for scoring). */
  extractedFacts?: string[];
};
