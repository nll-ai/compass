import {
  DEFAULT_LOOKBACK_DAYS,
  formatLookbackRangeUrlParam,
  LOOKBACK_UI_PRESET_DAYS,
  parseLookbackRangeUrlParam,
} from "./scan/lookback";

export { DEFAULT_LOOKBACK_DAYS, LOOKBACK_UI_PRESET_DAYS };

/** Ordered options for the Source Links / Timeline recency bar; driven by {@link LOOKBACK_UI_PRESET_DAYS}. */
export const RECENCY_RANGE_OPTIONS = [
  ...LOOKBACK_UI_PRESET_DAYS.map((d) => ({
    lookbackDays: d,
    label: `${d} days`,
    param: formatLookbackRangeUrlParam(d),
  })),
  { lookbackDays: 0 as const, label: "All", param: "all" as const },
] as const;

/** Parse Timeline / Source Links `range` query (alias of `parseLookbackRangeUrlParam` in `lib/scan/lookback`). */
export const lookbackDaysFromRangeParam = parseLookbackRangeUrlParam;

/** Format `range` query (alias of `formatLookbackRangeUrlParam` in `lib/scan/lookback`). */
export const rangeParamFromLookbackDays = formatLookbackRangeUrlParam;

export function buildSourceLinksQuery(extra: Record<string, string>, lookbackDays: number): string {
  const params = new URLSearchParams(extra);
  params.set("range", formatLookbackRangeUrlParam(lookbackDays));
  return params.toString();
}
