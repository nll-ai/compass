import { formatNcbiPdat } from "./pubmed-esearch-dates";
import type { RawItemInput } from "./types";

/**
 * Single product default for recency (calendar days): scans (`lookbackDays` omitted), Convex
 * `listByWatchTarget` when omitted, and Source Links / Timeline URL `range` when absent. Must be
 * one of {@link LOOKBACK_UI_PRESET_DAYS}.
 */
export const DEFAULT_LOOKBACK_DAYS = 14;

/**
 * Calendar-day presets for Timeline / Source Links URL `range` and recency pills (display order).
 * Programmatic `POST /api/scan` may still send any `1..MAX_LOOKBACK_DAYS`; URL and pills only
 * expose these values plus **0** (all time) via {@link formatLookbackRangeUrlParam}.
 */
export const LOOKBACK_UI_PRESET_DAYS = [7, 14, 30] as const;

/** @internal */
const LOOKBACK_UI_PRESET_SET: ReadonlySet<number> = new Set(LOOKBACK_UI_PRESET_DAYS);

if (!(LOOKBACK_UI_PRESET_DAYS as readonly number[]).includes(DEFAULT_LOOKBACK_DAYS)) {
  throw new Error("DEFAULT_LOOKBACK_DAYS must be one of LOOKBACK_UI_PRESET_DAYS");
}

/** Upper bound for `lookbackDays` from HTTP / Convex args (sanity). */
export const MAX_LOOKBACK_DAYS = 365;

/**
 * Allowed choices for Settings “Digest email: include sources from the last N days”.
 * Values are clamped to `1..MAX_LOOKBACK_DAYS` when set via API.
 */
export const DIGEST_EMAIL_LOOKBACK_CHOICES = [7, 14, 30, 60, 90] as const;

const MS_PER_DAY = 86_400_000;

/** Cutoff (ms): raw items with {@link rawItemEffectiveTimeMs} ≥ this are inside the window ending at `anchorMs`. */
export function lookbackWindowCutoffMs(anchorMs: number, lookbackDays: number): number {
  const safe = Math.min(MAX_LOOKBACK_DAYS, Math.max(1, Math.floor(lookbackDays)));
  return anchorMs - safe * MS_PER_DAY;
}

/**
 * Persisted digest-email lookback (calendar days). Omits invalid values; defaults to {@link DEFAULT_LOOKBACK_DAYS}.
 */
export function clampDigestEmailLookbackDays(raw: number | undefined | null): number {
  if (raw == null || typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_LOOKBACK_DAYS;
  const n = Math.floor(raw);
  if (n < 1) return 1;
  return Math.min(MAX_LOOKBACK_DAYS, n);
}

/**
 * True if the digest signal should appear in an email filtered by source recency: at least one linked
 * raw row falls on or after `cutoffMs`. Items with no `rawItemIds` stay included (no stored dates to filter on).
 */
export function digestItemQualifiesBySourceRecency(
  rawItemIds: readonly string[],
  getRawRow: (id: string) => { publishedAt?: number; _creationTime: number } | undefined,
  cutoffMs: number,
): boolean {
  if (rawItemIds.length === 0) return true;
  for (const id of rawItemIds) {
    const row = getRawRow(id);
    if (!row) continue;
    if (rawItemEffectiveTimeMs(row.publishedAt, row._creationTime) >= cutoffMs) return true;
  }
  return false;
}

function lookbackPresetDaysFromRangeToken(token: string): number | null {
  const m = /^(\d+)d$/i.exec(token.trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return LOOKBACK_UI_PRESET_SET.has(n) ? n : null;
}

/**
 * Parse Source Links / Timeline `range` query (`7d`, `14d`, `30d`, `all`, `0`).
 * Unknown or non-preset `Nd` → {@link DEFAULT_LOOKBACK_DAYS}.
 */
export function parseLookbackRangeUrlParam(param: string | null): number {
  if (param === null || param === "") return DEFAULT_LOOKBACK_DAYS;
  const t = param.trim().toLowerCase();
  if (t === "all" || t === "0") return 0;
  const preset = lookbackPresetDaysFromRangeToken(t);
  if (preset != null) return preset;
  return DEFAULT_LOOKBACK_DAYS;
}

/**
 * Format `range` query value. **0** → `all`; preset days → `Nd`; any other positive count → default preset param.
 */
export function formatLookbackRangeUrlParam(days: number): string {
  if (days <= 0) return "all";
  if (LOOKBACK_UI_PRESET_SET.has(days)) return `${days}d`;
  return `${DEFAULT_LOOKBACK_DAYS}d`;
}

/**
 * Resolve `lookbackDays` from `POST /api/scan` JSON.
 *
 * :param raw: Raw `lookbackDays` field (may be absent).
 * :returns: Positive days (clamped), or **0** = no recency limit (all time).
 */
export function resolveLookbackDaysFromRequest(raw: unknown): number {
  if (raw === null || raw === undefined) return DEFAULT_LOOKBACK_DAYS;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_LOOKBACK_DAYS;
  if (raw <= 0) return 0;
  return Math.min(MAX_LOOKBACK_DAYS, Math.max(1, Math.floor(raw)));
}

/**
 * Effective sort / filter timestamp for a stored raw row (Convex `rawItems`).
 *
 * :param publishedAt: Optional upstream publication time (ms).
 * :param creationTime: Convex `_creationTime` (ms).
 */
export function rawItemEffectiveTimeMs(publishedAt: number | undefined, creationTime: number): number {
  return publishedAt ?? creationTime;
}

/**
 * Keep items whose effective time falls on or after the cutoff derived from `lookbackDays`.
 *
 * :param lookbackDays: **0** disables filtering.
 */
export function filterStoredRawLikeByLookback<T extends { publishedAt?: number; _creationTime: number }>(
  items: T[],
  lookbackDays: number,
  nowMs: number,
): T[] {
  if (lookbackDays <= 0) return items;
  const cutoff = nowMs - lookbackDays * MS_PER_DAY;
  return items.filter((i) => rawItemEffectiveTimeMs(i.publishedAt, i._creationTime) >= cutoff);
}

/**
 * Before upsert, drop rows whose `publishedAt` falls before the lookback cutoff.
 * Undated inbound items (publishedAt == null) are also dropped when lookbackDays > 0,
 * because the lack of a date means we cannot confirm recency and downstream filters
 * would fall back to `_creationTime` (making them appear falsely recent).
 *
 * :param lookbackDays: **0** disables filtering.
 */
export function filterInboundRawItemsByLookback(items: RawItemInput[], lookbackDays: number, nowMs: number): RawItemInput[] {
  if (lookbackDays <= 0) return items;
  const cutoff = nowMs - lookbackDays * MS_PER_DAY;
  return items.filter((i) => {
    if (i.publishedAt == null) return false;
    return i.publishedAt >= cutoff;
  });
}

/**
 * Narrow PubMed `esearch` to **[today − N days, today]** (UTC calendar `pdat`) when no explicit
 * `pubmedPubDate` is provided on the scan request.
 *
 * :param days: Calendar-day window length (≥ 1).
 */
export function pubmedPubDateRangeForLookbackDays(days: number): { mode: "range"; mindate: string; maxdate: string } {
  const safe = Math.min(MAX_LOOKBACK_DAYS, Math.max(1, Math.floor(days)));
  const end = new Date();
  const start = new Date(end.getTime() - safe * MS_PER_DAY);
  return {
    mode: "range",
    mindate: formatNcbiPdat(start),
    maxdate: formatNcbiPdat(end),
  };
}
