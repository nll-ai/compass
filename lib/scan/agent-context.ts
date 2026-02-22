import type { ScanTarget, ScanOptions } from "./types";
import type { SourceId } from "../sources/registry";

/**
 * Context passed to every source agent by the orchestrator.
 * mission: orchestrator-provided goal (e.g. "Find new signals for daily digest...")
 * targets, env, scanOptions: same as current runners for API keys and mode.
 * existingExternalIdsBySource: per-source external IDs already stored (so agents can prioritize new items).
 */
export interface SourceAgentContext {
  mission: string;
  targets: ScanTarget[];
  env: Record<string, string | undefined>;
  scanOptions?: ScanOptions;
  /** External IDs we already have per source; agents should prioritize items not in this set. */
  existingExternalIdsBySource?: Record<SourceId, Set<string>>;
}

/** Shape of feedback returned by feedbackForScan.getFeedbackForMission (good/bad from digest items and source links). */
export interface FeedbackForMission {
  digestGood: Array<{ watchTargetId: string; headline: string; snippet: string }>;
  digestBad: Array<{ watchTargetId: string; headline: string; snippet: string }>;
  sourceGood: Array<{ watchTargetId: string; title: string; snippet: string }>;
  sourceBad: Array<{ watchTargetId: string; title: string; snippet: string }>;
}

/**
 * Build the shared mission string for a scan run.
 * Weaves in each target's "what to monitor" (notes) and, when provided, a synthesis of
 * what users previously marked as relevant vs not (thumbs up/down) so agents can tune retrieval.
 */
export function buildMission(
  period: "daily" | "weekly",
  options?: { mode?: "latest" | "comprehensive" },
  targets?: Array<{ displayName: string; notes?: string | null }>,
  feedback?: FeedbackForMission
): string {
  const scope = options?.mode === "comprehensive" ? "Comprehensive search." : "Focus on recent and relevant items.";
  const targetGoals =
    targets?.length &&
    targets
      .map(
        (t) =>
          `- ${t.displayName}: ${(t.notes ?? "").trim() || "general updates (trials, filings, news, publications)"}`
      )
      .join("\n");
  const missionBlock =
    targetGoals && targetGoals.length > 0
      ? `What to monitor (user-defined focus per target):\n${targetGoals}\n\n`
      : "";

  let feedbackBlock = "";
  if (feedback) {
    const favored: string[] = [];
    const notFavored: string[] = [];
    feedback.digestGood.forEach((e) => favored.push(`"${e.headline}"`));
    feedback.sourceGood.forEach((e) => favored.push(`"${e.title}"`));
    feedback.digestBad.forEach((e) => notFavored.push(`"${e.headline}"`));
    feedback.sourceBad.forEach((e) => notFavored.push(`"${e.title}"`));
    if (favored.length > 0 || notFavored.length > 0) {
      feedbackBlock =
        "Recent user feedback (use to tune retrieval — prefer items similar to favored; avoid or deprioritize items similar to not favored):\n";
      if (favored.length > 0) feedbackBlock += `Favored / marked relevant: ${favored.slice(0, 12).join(", ")}.\n`;
      if (notFavored.length > 0) feedbackBlock += `Not favored: ${notFavored.slice(0, 12).join(", ")}.\n`;
      feedbackBlock += "\n";
    }
  }

  return `${missionBlock}${feedbackBlock}Find new signals for a ${period} digest for the watch targets above. Only surface items that clearly help answer what the user wants to monitor for each target. Include trials, publications, SEC filings, patents, and news when relevant. ${scope} Use the tools available to you to search and retrieve items that match.`;
}
