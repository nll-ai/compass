import type { ScanOptions } from "./types";

/** Default “recent literature” window when `pubmedPubDate` is omitted or set to contemporaneous without years. */
export const DEFAULT_CONTEMPORANEOUS_YEARS = 3;

/**
 * NCBI E-utilities `esearch` expects publication-date bounds as **YYYY/MM/DD** (slashes), not ISO-8601
 * hyphens. Used with `datetype=pdat` (publication date).
 *
 * @see https://www.ncbi.nlm.nih.gov/books/NBK25499/#chapter4.ESearch
 */
export function formatNcbiPdat(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

/**
 * Resolve mindate/maxdate/datetype for PubMed `esearch` from scan options.
 * - **contemporaneous:** `[today − N years, today]` in UTC calendar dates (pdat).
 * - **unbounded:** omit date filters (full index for the query term).
 *
 * Future: optionally tighten `mindate` using the latest `publishedAt` already stored per target
 * (Convex `rawItems`) so the window tracks ingested coverage.
 */
export function getPubmedEsearchDateFields(
  scanOptions: ScanOptions | undefined
): { datetype?: "pdat"; mindate?: string; maxdate?: string } {
  const cfg = scanOptions?.pubmedPubDate ?? {
    mode: "contemporaneous" as const,
    years: DEFAULT_CONTEMPORANEOUS_YEARS,
  };
  if (cfg.mode === "unbounded") {
    return {};
  }
  const years = cfg.years ?? DEFAULT_CONTEMPORANEOUS_YEARS;
  const end = new Date();
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - years);
  return {
    datetype: "pdat",
    mindate: formatNcbiPdat(start),
    maxdate: formatNcbiPdat(end),
  };
}

/** Mutates `params` with `datetype`, `mindate`, `maxdate` when contemporaneous mode applies. */
export function applyPubmedEsearchDateParams(
  params: URLSearchParams,
  scanOptions: ScanOptions | undefined
): void {
  const { datetype, mindate, maxdate } = getPubmedEsearchDateFields(scanOptions);
  if (datetype) params.set("datetype", datetype);
  if (mindate) params.set("mindate", mindate);
  if (maxdate) params.set("maxdate", maxdate);
}

export function normalizePubmedPubDateInput(raw: unknown): NonNullable<ScanOptions["pubmedPubDate"]> {
  if (raw == null || typeof raw !== "object") {
    return { mode: "contemporaneous", years: DEFAULT_CONTEMPORANEOUS_YEARS };
  }
  const o = raw as { mode?: unknown; years?: unknown };
  if (o.mode === "unbounded") {
    return { mode: "unbounded" };
  }
  if (o.mode === "contemporaneous") {
    const years =
      typeof o.years === "number" && o.years >= 1 && o.years <= 50
        ? Math.floor(o.years)
        : DEFAULT_CONTEMPORANEOUS_YEARS;
    return { mode: "contemporaneous", years };
  }
  return { mode: "contemporaneous", years: DEFAULT_CONTEMPORANEOUS_YEARS };
}
