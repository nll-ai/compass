import type { DigestCategory, Significance } from "./types";

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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

/** First 1–2 sentences of executive summary for list cards (~160 chars or first period + sentence). */
export function executiveSummarySnippet(summary: string, maxLen = 160): string {
  const trimmed = summary.trim();
  if (!trimmed) return "";
  const firstPeriod = trimmed.indexOf(".");
  if (firstPeriod !== -1 && firstPeriod + 1 <= maxLen) {
    let end = firstPeriod + 1;
    const rest = trimmed.slice(end).trimStart();
    const secondPeriod = rest.indexOf(".");
    if (secondPeriod !== -1 && end + secondPeriod + 1 <= maxLen) {
      end += secondPeriod + 1;
    }
    return trimmed.slice(0, end).trim();
  }
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen).trim() + "…";
}
