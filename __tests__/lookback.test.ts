import { describe, expect, it } from "vitest";
import {
  clampDigestEmailLookbackDays,
  DEFAULT_LOOKBACK_DAYS,
  digestItemQualifiesBySourceRecency,
  filterInboundRawItemsByLookback,
  filterStoredRawLikeByLookback,
  formatLookbackRangeUrlParam,
  LOOKBACK_UI_PRESET_DAYS,
  lookbackWindowCutoffMs,
  parseLookbackRangeUrlParam,
  pubmedPubDateRangeForLookbackDays,
  rawItemEffectiveTimeMs,
  resolveLookbackDaysFromRequest,
} from "../lib/scan/lookback";
import {
  DEFAULT_LOOKBACK_DAYS as defaultReexportedFromUi,
  lookbackDaysFromRangeParam,
  rangeParamFromLookbackDays,
  RECENCY_RANGE_OPTIONS,
} from "../lib/sourceLinksRecencyUi";

describe("resolveLookbackDaysFromRequest", () => {
  it("defaults to 14 when omitted or null", () => {
    expect(resolveLookbackDaysFromRequest(undefined)).toBe(DEFAULT_LOOKBACK_DAYS);
    expect(resolveLookbackDaysFromRequest(null)).toBe(DEFAULT_LOOKBACK_DAYS);
  });
  it("returns 0 for non-positive numbers", () => {
    expect(resolveLookbackDaysFromRequest(0)).toBe(0);
    expect(resolveLookbackDaysFromRequest(-1)).toBe(0);
  });
  it("clamps positive days to 1..365", () => {
    expect(resolveLookbackDaysFromRequest(1)).toBe(1);
    expect(resolveLookbackDaysFromRequest(500)).toBe(365);
    expect(resolveLookbackDaysFromRequest(1.7)).toBe(1);
  });
  it("rejects invalid types with default", () => {
    expect(resolveLookbackDaysFromRequest("14")).toBe(DEFAULT_LOOKBACK_DAYS);
    expect(resolveLookbackDaysFromRequest(NaN)).toBe(DEFAULT_LOOKBACK_DAYS);
  });
});

describe("filterStoredRawLikeByLookback", () => {
  const now = 1_700_000_000_000;
  it("keeps all items when lookbackDays is 0", () => {
    const items = [
      { _creationTime: now - 86400000 * 400, publishedAt: now - 86400000 * 400 },
    ];
    expect(filterStoredRawLikeByLookback(items, 0, now)).toHaveLength(1);
  });
  it("uses publishedAt when set", () => {
    const old = now - 86400000 * 20;
    const recent = now - 86400000 * 5;
    const items = [
      { _creationTime: now, publishedAt: old },
      { _creationTime: now, publishedAt: recent },
    ];
    const out = filterStoredRawLikeByLookback(items, 14, now);
    expect(out).toHaveLength(1);
    expect(out[0].publishedAt).toBe(recent);
  });
  it("falls back to _creationTime when publishedAt missing", () => {
    const items = [{ _creationTime: now - 86400000 * 5 }];
    expect(filterStoredRawLikeByLookback(items, 14, now)).toHaveLength(1);
    expect(filterStoredRawLikeByLookback([{ _creationTime: now - 86400000 * 30 }], 14, now)).toHaveLength(0);
  });
});

describe("filterInboundRawItemsByLookback", () => {
  const now = 2_000_000_000_000;
  it("drops items without publishedAt when lookbackDays > 0", () => {
    const items = [{ watchTargetId: "x" as never, externalId: "1", title: "t", url: "u" }];
    expect(filterInboundRawItemsByLookback(items, 14, now)).toHaveLength(0);
  });
  it("keeps items without publishedAt when lookbackDays is 0", () => {
    const items = [{ watchTargetId: "x" as never, externalId: "1", title: "t", url: "u" }];
    expect(filterInboundRawItemsByLookback(items, 0, now)).toHaveLength(1);
  });
  it("drops old publishedAt", () => {
    const old = now - 86400000 * 100;
    const items = [
      {
        watchTargetId: "x" as never,
        externalId: "1",
        title: "t",
        url: "u",
        publishedAt: old,
      },
    ];
    expect(filterInboundRawItemsByLookback(items, 14, now)).toHaveLength(0);
  });
  it("keeps recent publishedAt within lookback window", () => {
    const recent = now - 86400000 * 5;
    const items = [
      {
        watchTargetId: "x" as never,
        externalId: "1",
        title: "t",
        url: "u",
        publishedAt: recent,
      },
    ];
    expect(filterInboundRawItemsByLookback(items, 14, now)).toHaveLength(1);
  });
});

describe("rawItemEffectiveTimeMs", () => {
  it("prefers publishedAt", () => {
    expect(rawItemEffectiveTimeMs(50, 100)).toBe(50);
  });
  it("uses creation when publishedAt missing", () => {
    expect(rawItemEffectiveTimeMs(undefined, 100)).toBe(100);
  });
});

describe("pubmedPubDateRangeForLookbackDays", () => {
  it("returns range mode with NCBI-style dates", () => {
    const r = pubmedPubDateRangeForLookbackDays(14);
    expect(r.mode).toBe("range");
    expect(r.mindate).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
    expect(r.maxdate).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
  });
});

describe("lookback URL presets (Timeline / Source Links)", () => {
  it("includes default in UI preset list", () => {
    expect(LOOKBACK_UI_PRESET_DAYS).toContain(DEFAULT_LOOKBACK_DAYS);
  });
  it("parseLookbackRangeUrlParam accepts only preset Nd", () => {
    expect(parseLookbackRangeUrlParam("60d")).toBe(DEFAULT_LOOKBACK_DAYS);
    for (const d of LOOKBACK_UI_PRESET_DAYS) {
      expect(parseLookbackRangeUrlParam(`${d}d`)).toBe(d);
    }
  });
  it("formatLookbackRangeUrlParam maps presets and non-preset counts", () => {
    for (const d of LOOKBACK_UI_PRESET_DAYS) {
      expect(formatLookbackRangeUrlParam(d)).toBe(`${d}d`);
    }
    expect(formatLookbackRangeUrlParam(0)).toBe("all");
    expect(formatLookbackRangeUrlParam(999)).toBe(`${DEFAULT_LOOKBACK_DAYS}d`);
  });
  it("RECENCY_RANGE_OPTIONS derives from LOOKBACK_UI_PRESET_DAYS plus All", () => {
    expect(RECENCY_RANGE_OPTIONS.map((o) => o.param)).toEqual(["7d", "14d", "30d", "all"]);
  });
});

describe("sourceLinksRecencyUi", () => {
  it("re-exports the same default as lib/scan/lookback", () => {
    expect(defaultReexportedFromUi).toBe(DEFAULT_LOOKBACK_DAYS);
  });
  it("parses range param", () => {
    expect(lookbackDaysFromRangeParam("14d")).toBe(14);
    expect(lookbackDaysFromRangeParam("all")).toBe(0);
    expect(lookbackDaysFromRangeParam(null)).toBe(DEFAULT_LOOKBACK_DAYS);
    expect(lookbackDaysFromRangeParam("bogus")).toBe(DEFAULT_LOOKBACK_DAYS);
  });
  it("formats param", () => {
    expect(rangeParamFromLookbackDays(0)).toBe("all");
    expect(rangeParamFromLookbackDays(14)).toBe("14d");
    expect(rangeParamFromLookbackDays(999)).toBe(`${DEFAULT_LOOKBACK_DAYS}d`);
  });
});

describe("clampDigestEmailLookbackDays", () => {
  it("defaults invalid input to DEFAULT_LOOKBACK_DAYS", () => {
    expect(clampDigestEmailLookbackDays(undefined)).toBe(DEFAULT_LOOKBACK_DAYS);
    expect(clampDigestEmailLookbackDays(null)).toBe(DEFAULT_LOOKBACK_DAYS);
    expect(clampDigestEmailLookbackDays(NaN)).toBe(DEFAULT_LOOKBACK_DAYS);
  });
  it("clamps to 1..365", () => {
    expect(clampDigestEmailLookbackDays(0)).toBe(1);
    expect(clampDigestEmailLookbackDays(500)).toBe(365);
  });
});

describe("lookbackWindowCutoffMs + digestItemQualifiesBySourceRecency", () => {
  it("excludes digest item when all linked raw rows are before cutoff", () => {
    const anchor = 1_700_000_000_000;
    const cutoff = lookbackWindowCutoffMs(anchor, 14);
    const map = new Map<string, { publishedAt?: number; _creationTime: number }>([
      ["a", { publishedAt: anchor - 20 * 86_400_000, _creationTime: anchor - 20 * 86_400_000 }],
    ]);
    expect(
      digestItemQualifiesBySourceRecency(["a"], (id) => map.get(id), cutoff),
    ).toBe(false);
  });
  it("includes digest item when any raw row is on or after cutoff", () => {
    const anchor = 1_700_000_000_000;
    const cutoff = lookbackWindowCutoffMs(anchor, 14);
    const map = new Map<string, { publishedAt?: number; _creationTime: number }>([
      ["a", { publishedAt: anchor - 20 * 86_400_000, _creationTime: anchor - 20 * 86_400_000 }],
      ["b", { publishedAt: anchor - 2 * 86_400_000, _creationTime: anchor - 2 * 86_400_000 }],
    ]);
    expect(
      digestItemQualifiesBySourceRecency(["a", "b"], (id) => map.get(id), cutoff),
    ).toBe(true);
  });
  it("includes item when rawItemIds is empty", () => {
    expect(digestItemQualifiesBySourceRecency([], () => undefined, 0)).toBe(true);
  });
});
