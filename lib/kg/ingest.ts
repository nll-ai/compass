/**
 * KG ingest builder: resolve a watch target to its central entity and assemble its
 * backbone neighborhood (entities + edges). Pure — performs HTTP via backbone clients
 * but does not touch Convex. Caps neighborhood size to keep the upsert bounded.
 */

import type { EdgeSpec, EdgeType, EntitySpec, ExternalRefs, NeighborhoodGraph } from "./types";
import { refKeyFor } from "./types";
import { resolveCentral } from "./resolve";
import { fetchDiseaseAssociations, fetchKnownDrugs } from "./backbones/opentargets";

const MAX_NEIGHBOR_ENTITIES = 30;
const MAX_EDGES = 60;

type WatchTargetLike = {
  name: string;
  displayName: string;
  type: EntitySpec["type"];
  company?: string;
  indication?: string;
  aliases: string[];
  therapeuticArea?: "cardiovascular" | "oncology" | "other";
};

/** Phase → confidence that a drug truly targets/develops against this target. */
function phaseToConfidence(phase: number): number {
  if (phase >= 4) return 0.95;
  if (phase === 3) return 0.85;
  if (phase === 2) return 0.7;
  if (phase === 1) return 0.55;
  return 0.4;
}

function otUrl(ensemblId: string): string {
  return `https://platform.opentargets.org/target/${ensemblId}`;
}

export async function buildNeighborhood(target: WatchTargetLike): Promise<NeighborhoodGraph> {
  const { central, ensemblId } = await resolveCentral(target);

  const entitiesByRef = new Map<string, EntitySpec>();
  const edges: EdgeSpec[] = [];
  const addEntity = (e: EntitySpec): string => {
    const existing = entitiesByRef.get(e.refKey);
    if (existing) {
      // merge aliases
      const merged = Array.from(new Set([...existing.aliases, ...e.aliases]));
      existing.aliases = merged;
      return existing.refKey;
    }
    entitiesByRef.set(e.refKey, e);
    return e.refKey;
  };
  const addEdge = (
    fromKey: string,
    toKey: string,
    type: EdgeType,
    confidence: number,
    evidence: EdgeSpec["evidence"],
  ) => {
    if (edges.length >= MAX_EDGES) return;
    if (fromKey === toKey) return;
    edges.push({ fromKey, toKey, type, confidence, evidence });
  };

  // Only biological targets have a backbone neighborhood in Phase 1.
  if (central.type === "target" && ensemblId) {
    const url = otUrl(ensemblId);

    // Target ↔ Indication (implicated_in)
    const associations = await fetchDiseaseAssociations(ensemblId).catch(() => []);
    for (const a of associations) {
      if (entitiesByRef.size >= MAX_NEIGHBOR_ENTITIES) break;
      const refs: ExternalRefs = a.diseaseId ? { openTargetsId: a.diseaseId } : {};
      const refKey = refKeyFor("indication", a.diseaseName, refs);
      addEntity({
        type: "indication",
        canonicalName: a.diseaseName,
        displayName: a.diseaseName,
        aliases: [],
        externalRefs: refs,
        refKey,
      });
      addEdge(
        central.refKey,
        refKey,
        "implicated_in",
        Math.max(0.05, Math.min(1, a.score)),
        [{ source: "opentargets:association", score: a.score, url }],
      );
    }

    // Drug → Target (targets), Drug → Company (developed_by), Drug → Indication (treats)
    const drugs = await fetchKnownDrugs(ensemblId).catch(() => []);
    for (const d of drugs) {
      if (entitiesByRef.size >= MAX_NEIGHBOR_ENTITIES) break;
      const drugRefs: ExternalRefs = d.drugId.startsWith("CHEMBL")
        ? { chembl: d.drugId }
        : { openTargetsId: d.drugId };
      const drugKey = addEntity({
        type: "drug",
        canonicalName: d.drugName,
        displayName: d.drugName,
        aliases: [],
        externalRefs: drugRefs,
        refKey: refKeyFor("drug", d.drugName, drugRefs),
      });
      const conf = phaseToConfidence(d.phase);
      // drug -[targets]-> target (central)
      addEdge(drugKey, central.refKey, "targets", conf, [
        { source: "opentargets:drug", score: d.phase, url, snippet: d.drugType },
      ]);

      if (d.company) {
        const coRefs: ExternalRefs = {};
        const coKey = addEntity({
          type: "company",
          canonicalName: d.company,
          displayName: d.company,
          aliases: [],
          externalRefs: coRefs,
          refKey: refKeyFor("company", d.company, coRefs),
        });
        addEdge(drugKey, coKey, "developed_by", conf, [{ source: "opentargets:drug", url }]);
      }
      if (d.diseaseId && d.diseaseName) {
        const refs: ExternalRefs = { openTargetsId: d.diseaseId };
        const indKey = addEntity({
          type: "indication",
          canonicalName: d.diseaseName,
          displayName: d.diseaseName,
          aliases: [],
          externalRefs: refs,
          refKey: refKeyFor("indication", d.diseaseName, refs),
        });
        addEdge(drugKey, indKey, "treats", conf, [{ source: "opentargets:drug", url }]);
      }
    }
  }

  return {
    central,
    neighbors: { entities: [...entitiesByRef.values()], edges },
  };
}
