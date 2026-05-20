import { describe, expect, it } from "vitest";
import {
  planDigestEmailForRecipient,
  type DigestItemForEmailPlan,
} from "../lib/digestEmailAssembly";

const baseDigestRun = {
  generatedAt: 1_700_000_000_000,
  period: "daily",
  executiveSummary: "Exec.",
  deltaSummary: "Delta",
  materialitySummary: "Mat",
  strategicReadSummary: "Read",
  recommendedActionsSummary: "Act",
  confidence: "high" as const,
};

function item(tid: string, rawIds: string[], headline: string): DigestItemForEmailPlan {
  return {
    watchTargetId: tid,
    rawItemIds: rawIds,
    significance: "high",
    category: "news",
    headline,
    synthesis: "Syn",
    sources: [],
  };
}

describe("planDigestEmailForRecipient", () => {
  it("includes executive summary and decision brief only when at least one signal passes source recency", () => {
    const anchor = baseDigestRun.generatedAt;
    const rawById = new Map([
      ["r-old", { publishedAt: anchor - 40 * 86_400_000, _creationTime: anchor - 40 * 86_400_000 }],
    ]);
    const { htmlArgs } = planDigestEmailForRecipient({
      digestRun: baseDigestRun,
      scanRunTargetIds: ["t1"],
      allDigestItems: [item("t1", ["r-old"], "Old signal")],
      targetDisplayNameById: new Map([["t1", "Target One"]]),
      subscribedWatchTargetIds: null,
      rawById,
      digestEmailLookbackDays: 14,
      decisionBriefPreference: "enabled",
      systemDecisionBriefDefault: true,
      appUrl: "https://app.example.com",
      dateStr: "Jan 1, 2024",
    });
    expect(htmlArgs.showExecutiveSummary).toBe(false);
    expect(htmlArgs.includeDecisionBrief).toBe(false);
    expect(htmlArgs.items).toHaveLength(0);
  });

  it("keeps signal when any linked raw row is within the window", () => {
    const anchor = baseDigestRun.generatedAt;
    const rawById = new Map([
      ["r-old", { publishedAt: anchor - 40 * 86_400_000, _creationTime: anchor - 40 * 86_400_000 }],
      ["r-new", { publishedAt: anchor - 2 * 86_400_000, _creationTime: anchor - 2 * 86_400_000 }],
    ]);
    const { htmlArgs } = planDigestEmailForRecipient({
      digestRun: baseDigestRun,
      scanRunTargetIds: ["t1"],
      allDigestItems: [item("t1", ["r-old", "r-new"], "Mixed ages")],
      targetDisplayNameById: new Map([["t1", "Target One"]]),
      subscribedWatchTargetIds: null,
      rawById,
      digestEmailLookbackDays: 14,
      decisionBriefPreference: "enabled",
      systemDecisionBriefDefault: true,
      appUrl: "https://app.example.com",
      dateStr: "Jan 1, 2024",
    });
    expect(htmlArgs.showExecutiveSummary).toBe(true);
    expect(htmlArgs.includeDecisionBrief).toBe(true);
    expect(htmlArgs.items).toHaveLength(1);
    expect(htmlArgs.items[0].headline).toBe("Mixed ages");
  });

  it("keeps digest items with empty rawItemIds without filtering by raw map", () => {
    const { htmlArgs } = planDigestEmailForRecipient({
      digestRun: baseDigestRun,
      scanRunTargetIds: ["t1"],
      allDigestItems: [item("t1", [], "No raw ids")],
      targetDisplayNameById: new Map([["t1", "T"]]),
      subscribedWatchTargetIds: null,
      rawById: new Map(),
      digestEmailLookbackDays: 14,
      decisionBriefPreference: "disabled",
      systemDecisionBriefDefault: true,
      appUrl: "https://app.example.com",
      dateStr: "Jan 1, 2024",
    });
    expect(htmlArgs.items).toHaveLength(1);
    expect(htmlArgs.showExecutiveSummary).toBe(true);
    expect(htmlArgs.includeDecisionBrief).toBe(false);
  });

  it("restricts digest items to subscribed targets when subscribedWatchTargetIds is a list", () => {
    const anchor = baseDigestRun.generatedAt;
    const rawById = new Map([
      ["r1", { publishedAt: anchor - 1 * 86_400_000, _creationTime: anchor - 1 * 86_400_000 }],
    ]);
    const { htmlArgs } = planDigestEmailForRecipient({
      digestRun: baseDigestRun,
      scanRunTargetIds: ["t1", "t2"],
      allDigestItems: [
        item("t1", ["r1"], "For t1"),
        item("t2", ["r1"], "For t2"),
      ],
      targetDisplayNameById: new Map([
        ["t1", "One"],
        ["t2", "Two"],
      ]),
      subscribedWatchTargetIds: ["t2"],
      rawById,
      digestEmailLookbackDays: 14,
      decisionBriefPreference: "inherit",
      systemDecisionBriefDefault: false,
      appUrl: "https://app.example.com",
      dateStr: "Jan 1, 2024",
    });
    expect(htmlArgs.recipientTargetIds).toEqual(["t2"]);
    expect(htmlArgs.items).toHaveLength(1);
    expect(htmlArgs.items[0].watchTargetId).toBe("t2");
  });

  it("uses multi-target subject when scan has more than one target", () => {
    const { subject } = planDigestEmailForRecipient({
      digestRun: { ...baseDigestRun, period: "weekly" },
      scanRunTargetIds: ["a", "b"],
      allDigestItems: [],
      targetDisplayNameById: new Map(),
      subscribedWatchTargetIds: null,
      rawById: new Map(),
      digestEmailLookbackDays: 14,
      systemDecisionBriefDefault: true,
      appUrl: "https://app.example.com",
      dateStr: "Jan 1, 2024",
    });
    expect(subject).toContain("2 targets");
  });
});
