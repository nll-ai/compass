import type { ScanTarget, SourceResult, ScanOptions } from "../types";
import { ALL_SOURCE_IDS, type SourceId } from "../../sources/registry";
import { runPubmed } from "./pubmed";
import { runClinicalTrials } from "./clinicaltrials";
import { runExa } from "./exa";
import { runEdgar } from "./edgar";
import { runOpenFda } from "./openfda";
import { runRss } from "./rss";
import { runPatents } from "./patents";

export type { SourceId } from "../../sources/registry";

const RUNNERS: Record<
  SourceId,
  (
    targets: ScanTarget[],
    env: Record<string, string | undefined>,
    options?: ScanOptions
  ) => Promise<SourceResult>
> = {
  pubmed: (t, e, o) => runPubmed(t, e, o),
  clinicaltrials: (t, e, o) => runClinicalTrials(t, e, o),
  edgar: (t, e, o) => runEdgar(t, e, o),
  exa: (t, e, o) => runExa(t, e, o),
  openfda: (_t, _e, o) => runOpenFda(undefined, undefined, o),
  rss: (_t, _e, o) => runRss(undefined, undefined, o),
  patents: (t, e, o) => runPatents(t, e, o),
};

export async function runAllSources(
  targets: ScanTarget[],
  env: Record<string, string | undefined>,
  options?: ScanOptions
): Promise<Record<SourceId, SourceResult>> {
  const results = await Promise.all(
    ALL_SOURCE_IDS.map(async (id) => {
      const result = await RUNNERS[id](targets, env, options);
      return [id, result] as const;
    })
  );
  return Object.fromEntries(results) as Record<SourceId, SourceResult>;
}
