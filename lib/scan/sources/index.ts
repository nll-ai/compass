import type { ScanTarget, SourceResult, ScanOptions } from "../types";
import { ALL_SOURCE_IDS, type SourceId } from "../../sources/registry";
import { buildMission, type SourceAgentContext, type FeedbackForMission } from "../agent-context";
import { runPubmed } from "./pubmed";
import { runClinicalTrials } from "./clinicaltrials";
import { runExa } from "./exa";
import { runEdgar } from "./edgar";
import { runOpenFda } from "./openfda";
import { runRss } from "./rss";
import { runPatents } from "./patents";

export type { SourceId } from "../../sources/registry";

const RUNNERS: Record<SourceId, (context: SourceAgentContext) => Promise<SourceResult>> = {
  pubmed: (ctx) => runPubmed(ctx),
  clinicaltrials: (ctx) => runClinicalTrials(ctx),
  edgar: (ctx) => runEdgar(ctx),
  exa: (ctx) => runExa(ctx),
  openfda: (ctx) => runOpenFda(ctx),
  rss: (ctx) => runRss(ctx),
  patents: (ctx) => runPatents(ctx),
};

/** When provided, only these sources are run; otherwise all sources. */
export async function runAllSources(
  targets: ScanTarget[],
  env: Record<string, string | undefined>,
  options?: ScanOptions & {
    period?: "daily" | "weekly";
    sources?: SourceId[];
    /** Existing external IDs per source (from DB) so agents prioritize new items. */
    existingExternalIdsBySource?: Record<string, string[]>;
    /** Recent thumbs up/down feedback to inject into mission so agents tune retrieval. */
    feedbackForMission?: FeedbackForMission;
  }
): Promise<Record<SourceId, SourceResult>> {
  const period = options?.period ?? "daily";
  const sourceIds =
    options?.sources?.length &&
    options.sources.every((s) => (ALL_SOURCE_IDS as readonly string[]).includes(s))
      ? (options.sources as SourceId[])
      : [...ALL_SOURCE_IDS];
  const mission = buildMission(period, { mode: options?.mode }, targets, options?.feedbackForMission);
  const existingBySource = options?.existingExternalIdsBySource;
  const existingExternalIdsBySource: Record<SourceId, Set<string>> | undefined = existingBySource
    ? (Object.fromEntries(
        Object.entries(existingBySource).map(([k, v]) => [k, new Set(v)] as [SourceId, Set<string>])
      ) as Record<SourceId, Set<string>>)
    : undefined;
  const context: SourceAgentContext = {
    mission,
    targets,
    env,
    scanOptions: options,
    existingExternalIdsBySource,
  };
  const results = await Promise.all(
    sourceIds.map(async (id) => {
      const result = await RUNNERS[id](context);
      return [id, result] as const;
    })
  );
  return Object.fromEntries(results) as Record<SourceId, SourceResult>;
}
