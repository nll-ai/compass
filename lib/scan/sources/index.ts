import type { ScanTarget, SourceResult } from "../types";
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
  run: (targets: ScanTarget[], env: Record<string, string | undefined>) => Promise<SourceResult>;
}> = [
  { name: "pubmed", run: (t, e) => runPubmed(t, e) },
  { name: "clinicaltrials", run: (t) => runClinicalTrials(t) },
  { name: "edgar", run: (t) => runEdgar(t) },
  { name: "exa", run: (t, e) => runExa(t, e) },
  { name: "openfda", run: () => runOpenFda() },
  { name: "rss", run: () => runRss() },
  { name: "patents", run: (t, e) => runPatents(t, e) },
];

export async function runAllSources(
  targets: ScanTarget[],
  env: Record<string, string | undefined>
): Promise<Record<SourceName, SourceResult>> {
  const results = await Promise.all(
    SOURCES.map(async (s) => {
      const result = await s.run(targets, env);
      return [s.name, result] as const;
    })
  );
  return Object.fromEntries(results) as Record<SourceName, SourceResult>;
}
