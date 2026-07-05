/**
 * KG ingest builder: resolve a watch target to its central entity and assemble its
 * backbone neighborhood (entities + edges). Pure — performs HTTP via backbone clients
 * but does not touch Convex. Caps neighborhood size to keep the upsert bounded.
 *
 * Phase 1 neighborhood (biological targets):
 *   - ENSG via Ensembl (UniProt xrefs are often transcripts; OT search is schema-unstable)
 *   - target ↔ indication (implicated_in) via Open Targets disease associations
 *   - drug → target (targets) via ChEMBL drug_mechanism (by UniProt accession)
 * Developers/companies are Phase 2 (ChEMBL has no developer field; OT `knownDrugs` is deprecated).
 */

import type { EdgeSpec, EdgeType, EntitySpec, ExternalRefs, NeighborhoodGraph } from "./types";
import { refKeyFor } from "./types";
import { resolveCentral } from "./resolve";
import { fetchDiseaseAssociations } from "./backbones/opentargets";
import { resolveGeneId } from "./backbones/ensembl";
import { fetchTargetDrugsByUniprot } from "./backbones/chembl";

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

/** Development phase → confidence that a drug truly targets this protein. */
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
  const { central, ensemblId: ensemblIdRaw } = await resolveCentral(target);

  const entitiesByRef = new Map<string, EntitySpec>();
  const edges: EdgeSpec[] = [];
  const addEntity = (e: EntitySpec): string => {
    const existing = entitiesByRef.get(e.refKey);
    if (existing) {
      existing.aliases = Array.from(new Set([...existing.aliases, ...e.aliases]));
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
  if (central.type === "target") {
    // Open Targets keys on the gene id (ENSG). Prefer a UniProt ENSG; else resolve via Ensembl.
    let ensemblId =
      ensemblIdRaw && ensemblIdRaw.startsWith("ENSG") ? ensemblIdRaw : undefined;
    if (!ensemblId) {
      for (const cand of [central.canonicalName, ...central.aliases]) {
        ensemblId = (await resolveGeneId(cand).catch(() => null)) ?? undefined;
        if (ensemblId) break;
      }
    }

    if (ensemblId) {
      const url = otUrl(ensemblId);
      // Target ↔ Indication (implicated_in) via Open Targets disease associations.
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
    }

    // Drugs targeting this protein (ChEMBL drug_mechanism, via the UniProt accession)
    // → drug -[targets]-> target (central).
    const uniprot = central.externalRefs.uniprot;
    if (uniprot) {
      const chemblDrugs = await fetchTargetDrugsByUniprot(uniprot).catch(() => []);
      for (const d of chemblDrugs) {
        if (entitiesByRef.size >= MAX_NEIGHBOR_ENTITIES) break;
        const drugRefs: ExternalRefs = { chembl: d.chemblId };
        const drugKey = addEntity({
          type: "drug",
          canonicalName: d.name,
          displayName: d.name,
          aliases: [],
          externalRefs: drugRefs,
          refKey: refKeyFor("drug", d.name, drugRefs),
        });
        addEdge(drugKey, central.refKey, "targets", phaseToConfidence(d.maxPhase), [
          {
            source: "chembl:drug_mechanism",
            score: d.maxPhase,
            url: `https://www.ebi.ac.uk/chembl/compound_report_card/${d.chemblId}`,
          },
        ]);
      }
    }
  }

  return {
    central,
    neighbors: { entities: [...entitiesByRef.values()], edges },
  };
}
