import type { SourceResult } from "../types";
import type { SourceAgentContext } from "../agent-context";
import { runFiercePharmaAgent } from "./fiercepharma-agent";

export async function runFiercePharma(context: SourceAgentContext): Promise<SourceResult> {
  if (context.targets.length === 0) return { items: [] };
  return runFiercePharmaAgent(context);
}
