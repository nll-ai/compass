import type { SourceAgentContext } from "../agent-context";
import type { SourceResult } from "../types";

/**
 * Legacy `rawItems` may use source `biorxiv`; schema accepts it for existing rows.
 * No live agent yet — scans skip this source (empty result).
 */
export async function runBiorxivStub(_ctx: SourceAgentContext): Promise<SourceResult> {
  return { items: [] };
}
