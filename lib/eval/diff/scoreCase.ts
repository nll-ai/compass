import type { DiffSummaryModelOutput, ExpectedChanges } from "./types";

export type DeterministicScore = {
  mustMentionHits: number;
  mustMentionTotal: number;
  mustNotViolations: number;
  /** Expected facts found / max(1, len(expected_facts)); omitted when no expected_facts. */
  factRecall?: number;
  /** Supported predicted facts / max(1, len(extractedFacts)); omitted when no extractedFacts. */
  factPrecision?: number;
  /** `extractedFacts` phrases with no case-insensitive substring match in before+after corpus. */
  unsupportedClaimCount?: number;
  expectedFactsTotal?: number;
  predictedFactsTotal?: number;
  /** 0–1 blended substring + fact metrics (see implementation). */
  score: number;
};

function combinedOutputText(output: DiffSummaryModelOutput): string {
  return [
    output.deltaSummary,
    output.materialitySummary,
    output.recommendedActionsSummary,
    ...(output.extractedFacts ?? []),
  ]
    .join("\n")
    .toLowerCase();
}

function substringBlockScore(expected: ExpectedChanges, combined: string): { hits: number; totalMust: number; violations: number; score: number } {
  const must = expected.must_mention ?? [];
  const mustNot = expected.must_not_mention ?? [];

  if (must.length === 0 && mustNot.length === 0) {
    return { hits: 0, totalMust: 0, violations: 0, score: 1 };
  }

  let hits = 0;
  for (const phrase of must) {
    if (combined.includes(phrase.toLowerCase().trim())) hits += 1;
  }

  let violations = 0;
  for (const phrase of mustNot) {
    if (combined.includes(phrase.toLowerCase().trim())) violations += 1;
  }

  const denom = Math.max(1, must.length + mustNot.length);
  const score = (hits + (mustNot.length - violations)) / denom;
  return {
    hits,
    totalMust: must.length,
    violations,
    score: Math.max(0, Math.min(1, score)),
  };
}

function factRecallScore(expectedFacts: string[], combined: string): number {
  if (expectedFacts.length === 0) return 1;
  let found = 0;
  for (const f of expectedFacts) {
    if (combined.includes(f.toLowerCase().trim())) found += 1;
  }
  return found / expectedFacts.length;
}

/**
 * Fact precision: among predicted atomic facts, fraction that are **grounded** in the before+after corpus
 * (case-insensitive substring of either snapshot). Aligns with "unsupported claim" detection.
 */
function factPrecisionAndUnsupported(
  predicted: string[],
  corpus: string,
): { precision: number; unsupported: number } {
  if (predicted.length === 0) {
    return { precision: 1, unsupported: 0 };
  }
  const c = corpus.toLowerCase();
  let supported = 0;
  for (const p of predicted) {
    const pl = p.toLowerCase().trim();
    if (pl.length > 0 && c.includes(pl)) supported += 1;
  }
  const unsupported = predicted.length - supported;
  return { precision: supported / predicted.length, unsupported };
}

/**
 * Layer-2 scoring: substring checks + optional fact recall/precision vs `expected_facts` and `extractedFacts`.
 * When `beforeText`+`afterText` are provided, counts **unsupported** predicted facts (not substring of either snapshot).
 */
export function scoreDeterministic(
  output: DiffSummaryModelOutput,
  expected: ExpectedChanges,
  options?: { beforeText?: string; afterText?: string },
): DeterministicScore {
  const combined = combinedOutputText(output);
  const { hits, totalMust, violations, score: substringScore } = substringBlockScore(expected, combined);

  const expectedFacts = expected.expected_facts ?? [];
  const predicted = output.extractedFacts ?? [];
  const corpus =
    options?.beforeText != null && options?.afterText != null
      ? `${options.beforeText}\n${options.afterText}`.toLowerCase()
      : "";

  const factRecall = expectedFacts.length > 0 ? factRecallScore(expectedFacts, combined) : undefined;

  let factPrecision: number | undefined;
  let unsupportedClaimCount: number | undefined;
  if (predicted.length > 0 && corpus.length > 0) {
    const fp = factPrecisionAndUnsupported(predicted, corpus);
    factPrecision = fp.precision;
    unsupportedClaimCount = fp.unsupported;
  }

  const parts: number[] = [substringScore];
  if (expectedFacts.length > 0 && factRecall !== undefined) parts.push(factRecall);
  if (predicted.length > 0 && factPrecision !== undefined) parts.push(factPrecision);

  const score = parts.reduce((a, b) => a + b, 0) / parts.length;

  return {
    mustMentionHits: hits,
    mustMentionTotal: totalMust,
    mustNotViolations: violations,
    factRecall,
    factPrecision,
    unsupportedClaimCount,
    expectedFactsTotal: expectedFacts.length > 0 ? expectedFacts.length : undefined,
    predictedFactsTotal: predicted.length > 0 ? predicted.length : undefined,
    score: Math.max(0, Math.min(1, score)),
  };
}
