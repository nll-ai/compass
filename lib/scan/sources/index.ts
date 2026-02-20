import type { ScanTarget, SourceResult, ScanOptions } from "../types";
import { runPubmed } from "./pubmed";
import { runClinicalTrials } from "./clinicaltrials";
import { runExa } from "./exa";
import { runEdgar } from "./edgar";
import { runOpenFda } from "./openfda";
import { runRss } from "./rss";
import { runPatents } from "./patents";

export type SourceName = "pubmed" | "clinicaltrials" | "edgar" | "exa" | "openfda" | "rss" | "patents";

const SOURCES: Array<{
  name: SourceName;
  run: (
    targets: ScanTarget[],
    env: Record<string, string | undefined>,
    options?: ScanOptions
  ) => Promise<SourceResult>;
}> = [
  { name: "pubmed", run: (t, e, o) => runPubmed(t, e, o) },
  { name: "clinicaltrials", run: (t, e, o) => runClinicalTrials(t, e, o) },
  { name: "edgar", run: (t, e, o) => runEdgar(t, e, o) },
  { name: "exa", run: (t, e, o) => runExa(t, e, o) },
  { name: "openfda", run: (_t, _e, o) => runOpenFda(undefined, undefined, o) },
  { name: "rss", run: (_t, _e, o) => runRss(undefined, undefined, o) },
  { name: "patents", run: (t, e, o) => runPatents(t, e, o) },
];

export async function runAllSources(
  targets: ScanTarget[],
  env: Record<string, string | undefined>,
  options?: ScanOptions
): Promise<Record<SourceName, SourceResult>> {
  const results = await Promise.all(
    SOURCES.map(async (s) => {
      const result = await s.run(targets, env, options);
      return [s.name, result] as const;
    })
  );
  return Object.fromEntries(results) as Record<SourceName, SourceResult>;
}
