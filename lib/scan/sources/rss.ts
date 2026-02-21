import type { SourceResult } from "../types";
import type { SourceAgentContext } from "../agent-context";
import { runRssAgent } from "./rss-agent";

export async function runRss(context: SourceAgentContext): Promise<SourceResult> {
  if (context.targets.length === 0) return { items: [] };
  return runRssAgent(context, { maxSteps: 3 });
}
