/**
 * Knowledge-graph shared types.
 * Used by lib/kg backbone clients, resolver, ingest builder, and convex/kg.ts.
 * Phase 1: read-only backbone graph (UniProt + Open Targets + ChEMBL + SEC).
 */

export type EntityType =
  | "target"
  | "drug"
  | "company"
  | "indication"
  | "mechanism"
  | "person"
  | "trial";

export type EdgeType =
  | "targets"
  | "targeted_by"
  | "developed_by"
  | "treats"
  | "tested_in"
  | "implicated_in"
  | "competes_with"
  | "analog_of";

export interface ExternalRefs {
  uniprot?: string;
  ensembl?: string;
  chembl?: string;
  /** Open Targets target id (ENSG...) or disease id (EFO/MONDO). */
  openTargetsId?: string;
  drugbank?: string;
  secCik?: string;
  mesh?: string;
}

export interface EdgeEvidence {
  source: string; // "uniprot" | "opentargets" | "chembl" | "sec" | "extracted:<src>" | "user"
  url?: string;
  snippet?: string;
  score?: number;
}

export interface EntitySpec {
  type: EntityType;
  canonicalName: string;
  displayName: string;
  aliases: string[];
  externalRefs: ExternalRefs;
  /** denormalized dedup key, e.g. "uniprot:Q5ZPR3"; falls back to "name:<type>:<lower(name)>". */
  refKey: string;
  therapeuticArea?: "cardiovascular" | "oncology" | "other";
  summary?: string;
}

export interface EdgeSpec {
  /** refKey of the source entity. */
  fromKey: string;
  /** refKey of the target entity. */
  toKey: string;
  type: EdgeType;
  confidence: number;
  evidence: EdgeEvidence[];
}

export interface NeighborhoodGraph {
  central: EntitySpec;
  neighbors: { entities: EntitySpec[]; edges: EdgeSpec[] };
}

/** Compute a stable dedup key from external refs (priority order), else by type+name. */
export function refKeyFor(type: EntityType, name: string, refs: ExternalRefs): string {
  const r =
    refs.uniprot ? `uniprot:${refs.uniprot}`
    : refs.ensembl ? `ensembl:${refs.ensembl}`
    : refs.chembl ? `chembl:${refs.chembl}`
    : refs.openTargetsId ? `ot:${refs.openTargetsId}`
    : refs.secCik ? `sec:${refs.secCik}`
    : refs.mesh ? `mesh:${refs.mesh}`
    : "";
  return r || `name:${type}:${name.trim().toLowerCase()}`;
}
