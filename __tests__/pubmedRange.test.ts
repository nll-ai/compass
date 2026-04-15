import { describe, expect, it } from "vitest";
import { getPubmedEsearchDateFields, normalizePubmedPubDateInput } from "../lib/scan/pubmed-esearch-dates";

describe("PubMed range pub date", () => {
  it("normalizes range mode from API input", () => {
    const cfg = normalizePubmedPubDateInput({
      mode: "range",
      mindate: "2024-01-01",
      maxdate: "2024-06-30",
    });
    expect(cfg.mode).toBe("range");
    if (cfg.mode === "range") {
      expect(cfg.mindate).toBe("2024-01-01");
      expect(cfg.maxdate).toBe("2024-06-30");
    }
  });

  it("applies range to esearch params", () => {
    const fields = getPubmedEsearchDateFields({
      mode: "comprehensive",
      pubmedPubDate: { mode: "range", mindate: "2024/01/01", maxdate: "2024/12/31" },
    });
    expect(fields.datetype).toBe("pdat");
    expect(fields.mindate).toBe("2024/01/01");
    expect(fields.maxdate).toBe("2024/12/31");
  });
});
