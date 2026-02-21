import type { ScanTarget, SourceResult, ScanOptions } from "./types";
import { buildMission, type SourceAgentContext } from "./agent-context";
import { ALL_SOURCE_IDS, type SourceId } from "../sources/registry";
import { runPubmed } from "./sources/pubmed";
import { runClinicalTrials } from "./sources/clinicaltrials";
import { runExa } from "./sources/exa";
import { runEdgar } from "./sources/edgar";
import { runOpenFda } from "./sources/openfda";
import { runRss } from "./sources/rss";
import { runPatents } from "./sources/patents";

/**
 * Runner map: each source is invoked with SourceAgentContext.
 * Legacy runners are wrapped to use context.targets, context.env, context.scanOptions.
 * Agent-based runners receive full context (including mission).
 */
const RUNNERS: Record<SourceId, (context: SourceAgentContext) => Promise<SourceResult>> = {
  pubmed: (ctx) => runPubmed(ctx),
  clinicaltrials: (ctx) => runClinicalTrials(ctx),
  edgar: (ctx) => runEdgar(ctx),
  exa: (ctx) => runExa(ctx),
  openfda: (ctx) => runOpenFda(ctx),
  rss: (ctx) => runRss(ctx),
  patents: (ctx) => runPatents(ctx),
};

/**
 * Run all sources with a shared mission and context.
 * Builds SourceAgentContext (mission, targets, env, scanOptions) and
 * invokes each runner. Runners that use agents receive context.mission.
 * Returns the same shape as runAllSources for drop-in use in the scan route.
 */
export async function runWithOrchestrator(
  targets: ScanTarget[],
  env: Record<string, string | undefined>,
  options?: ScanOptions & { period?: "daily" | "weekly" }
): Promise<Record<SourceId, SourceResult>> {
  const period = options?.period ?? "daily";
  const mission = buildMission(period, { mode: options?.mode }, targets);
  const context: SourceAgentContext = {
    mission,
    targets,
    env,
    scanOptions: options,
  };

  const results = await Promise.all(
    ALL_SOURCE_IDS.map(async (id) => {
      const result = await RUNNERS[id](context);
      return [id, result] as const;
    })
  );

  return Object.fromEntries(results) as Record<SourceId, SourceResult>;
}
