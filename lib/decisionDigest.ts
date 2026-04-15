/**
 * Decision Digest: structured sections that frame digest output as a team decision artifact.
 * Optional on stored `digestRuns`; generation is gated by `DECISION_DIGEST_ENABLED` on the server.
 */

export type DecisionConfidence = "low" | "medium" | "high";

export interface DecisionDigestSections {
  deltaSummary: string;
  materialitySummary: string;
  recommendedActionsSummary: string;
  /** Interpretive lane vs prior digests; optional when model leaves it empty. */
  strategicReadSummary?: string;
  confidence: DecisionConfidence;
}

/** True when scan/digest pipeline should request Decision Digest sections from the LLM. */
export function isDecisionDigestGenerationEnabled(): boolean {
  return process.env.DECISION_DIGEST_ENABLED === "true";
}

/**
 * Appended to decision-brief prompts. Override with `DECISION_DIGEST_STRATEGIC_LENS_CUSTOM`,
 * or set `DECISION_DIGEST_STRATEGIC_FOCUS` to `market` | `science` | `balanced` (default).
 */
export function decisionDigestStrategicLensInstructions(): string {
  const custom = process.env.DECISION_DIGEST_STRATEGIC_LENS_CUSTOM?.trim();
  if (custom) {
    return `\n\nConfigured strategic lens (apply especially to strategicReadSummary):\n${custom.slice(0, 2000)}`;
  }
  const focus = (process.env.DECISION_DIGEST_STRATEGIC_FOCUS ?? "balanced").toLowerCase();
  if (focus === "market") {
    return "\n\nStrategic lens: prioritize competitive, commercial/regulatory timing, and investor-relevant implications; science only when sources support it.";
  }
  if (focus === "science") {
    return "\n\nStrategic lens: prioritize mechanistic, clinical/translational, and evidence-quality implications; market tone only when sources support it.";
  }
  return "\n\nStrategic lens: balance scientific and commercial angles as the sources suggest.";
}

/**
 * Normalize LLM decision fields: omit when all substantive sections are empty (backward compatible storage).
 */
export function mergeDecisionDigestFromLlm(o: {
  deltaSummary: string;
  materialitySummary: string;
  recommendedActionsSummary: string;
  strategicReadSummary: string;
  confidence: DecisionConfidence;
}): DecisionDigestSections | undefined {
  const deltaSummary = o.deltaSummary.trim();
  const materialitySummary = o.materialitySummary.trim();
  const recommendedActionsSummary = o.recommendedActionsSummary.trim();
  const strategicReadSummary = o.strategicReadSummary.trim();
  const hasSubstance =
    deltaSummary.length > 0 ||
    materialitySummary.length > 0 ||
    recommendedActionsSummary.length > 0 ||
    strategicReadSummary.length > 0;
  if (!hasSubstance) return undefined;
  const base: DecisionDigestSections = {
    deltaSummary,
    materialitySummary,
    recommendedActionsSummary,
    confidence: o.confidence,
  };
  if (strategicReadSummary.length > 0) {
    return { ...base, strategicReadSummary };
  }
  return base;
}
