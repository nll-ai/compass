import type { SourceType } from "./types";
import { getSourceLabel } from "./sources/registry";

export function sourceLabel(source: SourceType): string {
  return getSourceLabel(source);
}

/** Date label shown next to a source (e.g. "Pub date", "Trial start"). */
const dateLabels: Record<string, string> = {
  pubmed: "Pub date",
  clinicaltrials: "Trial start",
  edgar: "Filed",
  exa: "Published",
  openfda: "Published",
  rss: "Published",
  patents: "Published",
};

function formatDateMs(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Returns a display string for the source date (e.g. "Pub date: 2021 Feb", "Trial start: Feb 2, 2023")
 * for use next to original sources. Uses metadata.pubdate (as-is), metadata.startDate/publishedDate
 * (formatted), or publishedAt timestamp.
 */
export function formatSourceDate(
  source: string,
  publishedAt?: number | null,
  metadata?: Record<string, unknown> | null
): string | undefined {
  const label = dateLabels[source] ?? "Published";
  const pubdate = metadata?.pubdate as string | undefined;
  if (pubdate) return `${label}: ${pubdate}`;
  const iso = (metadata?.startDate as string) ?? (metadata?.publishedDate as string);
  if (iso) {
    const ms = new Date(iso).getTime();
    if (!Number.isNaN(ms)) return `${label}: ${formatDateMs(ms)}`;
  }
  if (publishedAt != null && !Number.isNaN(publishedAt)) return `${label}: ${formatDateMs(publishedAt)}`;
  return undefined;
}
