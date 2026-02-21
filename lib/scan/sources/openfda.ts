import type { SourceResult } from "../types";
import type { SourceAgentContext } from "../agent-context";
import { runOpenFdaAgent } from "./openfda-agent";

export async function runOpenFda(context: SourceAgentContext): Promise<SourceResult> {
  if (context.targets.length === 0) return { items: [] };
  return runOpenFdaAgent(context, { maxSteps: 3 });
}
