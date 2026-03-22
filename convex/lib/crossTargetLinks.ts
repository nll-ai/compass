import type { Doc, Id } from "../_generated/dataModel";

/** Phase 1: one stable key per raw item for cross-target matching (source + external id). */
export function linkKeyForRawItem(item: Pick<Doc<"rawItems">, "source" | "externalId">): string {
  return `${item.source}:${item.externalId}`;
}

/**
 * Workspace key shared by watch targets that may be linked in the graph.
 * Team targets use team scope; personal targets use owner user id.
 */
export function scopeKeyForWatchTarget(target: Doc<"watchTargets">): string | null {
  if (target.teamId != null) return `team:${target.teamId}`;
  if (target.userId != null) return `user:${target.userId}`;
  return null;
}

export function orderedTargetPair(
  a: Id<"watchTargets">,
  b: Id<"watchTargets">,
): [Id<"watchTargets">, Id<"watchTargets">] {
  return a < b ? [a, b] : [b, a];
}

const MAX_RAW_IDS_PER_EDGE = 40;

/** Merge ids, dedupe, cap length (newest wins by array order — caller passes recent first if needed). */
export function mergeRawItemIds(
  existing: Id<"rawItems">[],
  additions: Id<"rawItems">[],
): Id<"rawItems">[] {
  const out: Id<"rawItems">[] = [];
  const seen = new Set<string>();
  for (const id of [...additions, ...existing]) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_RAW_IDS_PER_EDGE) break;
  }
  return out;
}
