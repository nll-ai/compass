import { describe, expect, it } from "vitest";
import { join } from "path";
import { loadExpectedChanges, loadCaseMetadata, loadExpectedSummaryMarkdown } from "../lib/eval/diff/caseFiles";

const SMOKE = join(process.cwd(), "eval", "diff", "cases", "synthetic-smoke");

describe("diff eval case files", () => {
  it("loads expected_changes.yaml from synthetic-smoke", () => {
    const exp = loadExpectedChanges(SMOKE);
    expect(exp.must_mention).toContain("PFS");
    expect(exp.must_mention).toContain("180");
    expect(exp.must_not_mention).toContain("fabricated trial");
    expect(exp.expected_facts).toContain("progression-free survival");
  });

  it("loads metadata.yaml", () => {
    const meta = loadCaseMetadata(SMOKE);
    expect(meta?.source).toBe("pubmed");
    expect(meta?.difficulty).toBe("easy");
    expect(meta?.change_types).toContain("endpoint_change");
  });

  it("loads expected_summary.md for judge rubric", () => {
    const md = loadExpectedSummaryMarkdown(SMOKE);
    expect(md).toContain("PFS");
    expect(md).toContain("fabricated trial");
  });
});
