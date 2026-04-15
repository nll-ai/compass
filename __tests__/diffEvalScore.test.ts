import { describe, expect, it } from "vitest";
import { scoreDeterministic } from "../lib/eval/diff/scoreCase";
import type { DiffSummaryModelOutput } from "../lib/eval/diff/types";

describe("scoreDeterministic", () => {
  it("counts must_mention hits and must_not violations", () => {
    const output: DiffSummaryModelOutput = {
      deltaSummary: "Primary endpoint is now PFS.",
      materialitySummary: "Enrollment increased to 180.",
      recommendedActionsSummary: "Review protocol.",
      confidence: "high",
      extractedFacts: [],
    };
    const s = scoreDeterministic(output, {
      must_mention: ["PFS", "180"],
      must_not_mention: ["fabricated trial"],
    });
    expect(s.mustMentionHits).toBe(2);
    expect(s.mustMentionTotal).toBe(2);
    expect(s.mustNotViolations).toBe(0);
    expect(s.score).toBeGreaterThan(0.9);
  });

  it("computes fact recall and precision with corpus for unsupported claims", () => {
    const output: DiffSummaryModelOutput = {
      deltaSummary: "Enrollment is 180.",
      materialitySummary: "",
      recommendedActionsSummary: "",
      confidence: "medium",
      extractedFacts: ["Target enrollment: 180 participants", "Fictional Mars arm added"],
    };
    const s = scoreDeterministic(
      output,
      {
        expected_facts: ["180", "enrollment"],
      },
      {
        beforeText: "Target enrollment: 120",
        afterText: "Target enrollment: 180 participants",
      },
    );
    expect(s.factRecall).toBe(1);
    expect(s.factPrecision).toBe(0.5);
    expect(s.unsupportedClaimCount).toBe(1);
    expect(s.score).toBeGreaterThan(0.5);
  });

  it("treats empty must/must_not as neutral substring block", () => {
    const output: DiffSummaryModelOutput = {
      deltaSummary: "Any text.",
      materialitySummary: "",
      recommendedActionsSummary: "",
      confidence: "low",
    };
    const s = scoreDeterministic(output, {});
    expect(s.score).toBe(1);
  });
});
