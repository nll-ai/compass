import type { SourceResult } from "../types";
import type { SourceAgentContext } from "../agent-context";
import { runPatentsAgent } from "./patents-agent";

export async function runPatents(context: SourceAgentContext): Promise<SourceResult> {
  const { targets, env } = context;
  const apiKey = env.PATENTSVIEW_API_KEY;
  if (!apiKey) return { items: [] };
  if (targets.length === 0) return { items: [] };
  return runPatentsAgent(context, { maxSteps: 5 });
}
