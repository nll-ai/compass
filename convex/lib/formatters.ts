import type { DigestCategory, Significance } from "./types";

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const sourceDateLabels: Record<string, string> = {
  pubmed: "Pub date",
  clinicaltrials: "Trial start",
  edgar: "Filed",
  exa: "Published",
  openfda: "Published",
  rss: "Published",
  patents: "Published",
};

export function formatSourceDate(
  source: string,
  publishedAt?: number | null,
  metadata?: Record<string, unknown> | null
): string | undefined {
  const label = sourceDateLabels[source] ?? "Published";
  const pubdate = metadata?.pubdate as string | undefined;
  if (pubdate) return `${label}: ${pubdate}`;
  const iso = (metadata?.startDate as string) ?? (metadata?.publishedDate as string);
  if (iso) {
    const ms = new Date(iso).getTime();
    if (!Number.isNaN(ms)) return `${label}: ${formatDate(ms)}`;
  }
  if (publishedAt != null && !Number.isNaN(publishedAt)) return `${label}: ${formatDate(publishedAt)}`;
  return undefined;
}

export function formatCategory(category: DigestCategory): string {
  return category
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function significanceEmoji(significance: Significance): string {
  const map: Record<Significance, string> = {
    critical: "🔴",
    high: "🟠",
    medium: "🟡",
    low: "⚪",
  };
  return map[significance];
}
