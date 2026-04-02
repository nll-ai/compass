import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CONTEMPORANEOUS_YEARS,
  formatNcbiPdat,
  getPubmedEsearchDateFields,
  normalizePubmedPubDateInput,
} from "../lib/scan/pubmed-esearch-dates";

describe("formatNcbiPdat", () => {
  it("formats UTC date as YYYY/MM/DD for NCBI esearch", () => {
    expect(formatNcbiPdat(new Date("2026-01-05T00:00:00.000Z"))).toBe("2026/01/05");
  });
});

describe("getPubmedEsearchDateFields", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty object for unbounded", () => {
    expect(
      getPubmedEsearchDateFields({
        mode: "latest",
        pubmedPubDate: { mode: "unbounded" },
      })
    ).toEqual({});
  });

  it("uses pdat and contemporaneous window in NCBI slash format", () => {
    expect(
      getPubmedEsearchDateFields({
        mode: "comprehensive",
        pubmedPubDate: { mode: "contemporaneous", years: 3 },
      })
    ).toEqual({
      datetype: "pdat",
      mindate: "2023/04/01",
      maxdate: "2026/04/01",
    });
  });

  it("defaults omitted pubmedPubDate to contemporaneous with default years", () => {
    expect(getPubmedEsearchDateFields({ mode: "latest" })).toEqual({
      datetype: "pdat",
      mindate: `2023/04/01`,
      maxdate: "2026/04/01",
    });
  });
});

describe("normalizePubmedPubDateInput", () => {
  it("defaults to contemporaneous with default years", () => {
    expect(normalizePubmedPubDateInput(undefined)).toEqual({
      mode: "contemporaneous",
      years: DEFAULT_CONTEMPORANEOUS_YEARS,
    });
  });

  it("preserves unbounded", () => {
    expect(normalizePubmedPubDateInput({ mode: "unbounded" })).toEqual({ mode: "unbounded" });
  });

  it("clamps invalid years to default", () => {
    expect(normalizePubmedPubDateInput({ mode: "contemporaneous", years: 0 })).toEqual({
      mode: "contemporaneous",
      years: DEFAULT_CONTEMPORANEOUS_YEARS,
    });
  });
});
