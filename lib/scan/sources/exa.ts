import type { SourceResult } from "../types";
import type { SourceAgentContext } from "../agent-context";
import { runExaAgent } from "./exa-agent";

export async function runExa(context: SourceAgentContext): Promise<SourceResult> {
  const { targets, env } = context;
  const apiKey = env.EXA_API_KEY;
  if (!apiKey) return { items: [] };
  if (targets.length === 0) return { items: [] };
  return runExaAgent(context, { maxSteps: 5 });
}
