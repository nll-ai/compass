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
