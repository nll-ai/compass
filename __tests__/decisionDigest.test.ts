import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decisionDigestStrategicLensInstructions,
  isDecisionDigestGenerationEnabled,
  mergeDecisionDigestFromLlm,
} from "../lib/decisionDigest";

describe("decisionDigest", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("isDecisionDigestGenerationEnabled is true only for exact env string", () => {
    vi.stubEnv("DECISION_DIGEST_ENABLED", "true");
    expect(isDecisionDigestGenerationEnabled()).toBe(true);
    vi.stubEnv("DECISION_DIGEST_ENABLED", "1");
    expect(isDecisionDigestGenerationEnabled()).toBe(false);
    vi.stubEnv("DECISION_DIGEST_ENABLED", "");
    expect(isDecisionDigestGenerationEnabled()).toBe(false);
  });

  it("mergeDecisionDigestFromLlm returns undefined when all sections are empty", () => {
    expect(
      mergeDecisionDigestFromLlm({
        deltaSummary: "   ",
        materialitySummary: "",
        recommendedActionsSummary: "\n",
        strategicReadSummary: "",
        confidence: "high",
      }),
    ).toBeUndefined();
  });

  it("mergeDecisionDigestFromLlm trims and returns sections when any field has content", () => {
    const d = mergeDecisionDigestFromLlm({
      deltaSummary: "  One fact. ",
      materialitySummary: "",
      recommendedActionsSummary: "",
      strategicReadSummary: "",
      confidence: "medium",
    });
    expect(d).toEqual({
      deltaSummary: "One fact.",
      materialitySummary: "",
      recommendedActionsSummary: "",
      confidence: "medium",
    });
  });

  it("mergeDecisionDigestFromLlm includes strategicReadSummary when non-empty", () => {
    const d = mergeDecisionDigestFromLlm({
      deltaSummary: "",
      materialitySummary: "",
      recommendedActionsSummary: "",
      strategicReadSummary: "  [Hypothesis] Posture shifted. ",
      confidence: "low",
    });
    expect(d).toEqual({
      deltaSummary: "",
      materialitySummary: "",
      recommendedActionsSummary: "",
      strategicReadSummary: "[Hypothesis] Posture shifted.",
      confidence: "low",
    });
  });

  it("decisionDigestStrategicLensInstructions uses custom env when set", () => {
    vi.stubEnv("DECISION_DIGEST_STRATEGIC_LENS_CUSTOM", "Focus on EU regulatory path.");
    expect(decisionDigestStrategicLensInstructions()).toContain("Focus on EU regulatory path.");
  });

  it("decisionDigestStrategicLensInstructions respects DECISION_DIGEST_STRATEGIC_FOCUS", () => {
    vi.stubEnv("DECISION_DIGEST_STRATEGIC_FOCUS", "science");
    expect(decisionDigestStrategicLensInstructions().toLowerCase()).toContain("mechanistic");
  });
});
