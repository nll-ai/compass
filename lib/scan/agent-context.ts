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

/**
 * Build the shared mission string for a scan run.
 * Weaves in each target's "what to monitor" (notes) so agents can focus and filter.
 */
export function buildMission(
  period: "daily" | "weekly",
  options?: { mode?: "latest" | "comprehensive" },
  targets?: Array< { displayName: string; notes?: string | null } >
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
  return `${missionBlock}Find new signals for a ${period} digest for the watch targets above. Only surface items that clearly help answer what the user wants to monitor for each target. Include trials, publications, SEC filings, patents, and news when relevant. ${scope} Use the tools available to you to search and retrieve items that match.`;
}
