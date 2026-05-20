import { describe, expect, it } from "vitest";
import { buildDigestEmailHtml } from "../convex/email";

describe("buildDigestEmailHtml", () => {
  it("renders app-like digest sections with decision brief and signal cards", () => {
    const html = buildDigestEmailHtml({
      appUrl: "https://compass.example.com",
      period: "daily",
      dateStr: "Apr 20, 2026",
      executiveSummary: "Team-wide delta summary.",
      showExecutiveSummary: true,
      deltaSummary: "Enrollment accelerated.",
      materialitySummary: "Could move timeline by one quarter.",
      strategicReadSummary: "[Hypothesis] Competitor posture changed.",
      recommendedActionsSummary: "Validate assumptions with KOLs.",
      confidence: "medium",
      includeDecisionBrief: true,
      emailLookbackDays: 14,
      recipientTargetIds: ["t-alpha"],
      items: [
        {
          watchTargetId: "t-alpha",
          significance: "medium",
          category: "trial_update",
          headline: "Phase 2 site expansion",
          synthesis: "No additional summary available.",
          sources: [
            {
              url: "https://example.com/alpha-trial",
              title: "Registry entry",
              source: "clinicaltrials",
              date: "2026-04-20",
            },
          ],
        },
      ],
      targetDisplayNameById: new Map([["t-alpha", "Atrial Natriuretic Peptide (ANP)"]]),
    });

    expect(html).toContain("Decision brief");
    expect(html).toContain("Signals in the last 14 days (1)");
    expect(html).toContain("Links to original sources");
    expect(html).toContain("View full digest for Atrial Natriuretic Peptide (ANP)");
    expect(html).toMatchSnapshot();
  });

  it("sanitizes unsafe source href and escapes HTML in text content", () => {
    const html = buildDigestEmailHtml({
      appUrl: "https://compass.example.com",
      period: "daily",
      dateStr: "Apr 20, 2026",
      executiveSummary: "<b>unsafe</b>",
      showExecutiveSummary: true,
      includeDecisionBrief: true,
      emailLookbackDays: 14,
      recipientTargetIds: ["t-one"],
      items: [
        {
          watchTargetId: "t-one",
          significance: "high",
          category: "news",
          headline: "Headline <script>alert(1)</script>",
          synthesis: "Body with <b>tag</b>",
          sources: [{ url: "javascript:alert(1)", title: "<Click>", source: "rss" }],
        },
      ],
      targetDisplayNameById: new Map([["t-one", "Target <One>"]]),
    });

    expect(html).toContain("&lt;b&gt;unsafe&lt;/b&gt;");
    expect(html).toContain("Headline &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Body with &lt;b&gt;tag&lt;/b&gt;");
    expect(html).toContain('href="#"');
  });

  it("hides decision brief when recipient preference disables it", () => {
    const html = buildDigestEmailHtml({
      appUrl: "https://compass.example.com",
      period: "daily",
      dateStr: "Apr 20, 2026",
      executiveSummary: "Summary.",
      showExecutiveSummary: true,
      deltaSummary: "Changed.",
      materialitySummary: "Matters.",
      strategicReadSummary: "Read.",
      recommendedActionsSummary: "Act.",
      confidence: "high",
      includeDecisionBrief: false,
      emailLookbackDays: 14,
      recipientTargetIds: [],
      items: [],
      targetDisplayNameById: new Map(),
    });
    expect(html).not.toContain("Decision brief");
  });

  it("shows per-target empty copy when there are no in-window signals", () => {
    const html = buildDigestEmailHtml({
      appUrl: "https://compass.example.com",
      period: "weekly",
      dateStr: "Apr 21, 2026",
      executiveSummary: "Run summary.",
      showExecutiveSummary: false,
      includeDecisionBrief: false,
      emailLookbackDays: 30,
      recipientTargetIds: ["t-empty"],
      items: [],
      targetDisplayNameById: new Map([["t-empty", "Empty target"]]),
    });
    expect(html).toContain("Nothing new was found within the last 30 days for this watch target.");
    expect(html).toContain("Signals in the last 30 days (0)");
  });
});
