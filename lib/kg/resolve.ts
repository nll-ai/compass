/**
 * KG resolver: map a watch target to a canonical KG entity (central EntitySpec) using
 * the appropriate backbone. Best-effort: if no backbone resolves, falls back to a
 * name-based entity (still deduped by name). Returns the Ensembl id when available so
 * the Open Targets neighborhood can be fetched for biological targets.
 */

import type { EntitySpec, EntityType, ExternalRefs } from "./types";
import { refKeyFor } from "./types";
import { searchTarget, uniprotRefs, type UniProtEntry } from "./backbones/uniprot";
import { searchMolecule, type ChEMBLMolecule } from "./backbones/chembl";
import { resolveCompanyToSEC } from "../scan/sources/edgar-agent";

type WatchTargetLike = {
  name: string;
  displayName: string;
  type: EntityType;
  company?: string;
  indication?: string;
  aliases: string[];
  therapeuticArea?: "cardiovascular" | "oncology" | "other";
};

export interface ResolvedCentral {
  central: EntitySpec;
  /** Ensembl gene id when the target resolved via UniProt (for Open Targets neighborhood). */
  ensemblId?: string;
}

function spec(
  type: EntityType,
  canonicalName: string,
  displayName: string,
  refs: ExternalRefs,
  aliases: string[],
  therapeuticArea: EntitySpec["therapeuticArea"],
  summary?: string,
): EntitySpec {
  return {
    type,
    canonicalName,
    displayName,
    aliases: Array.from(new Set(aliases.map((a) => a.trim()).filter(Boolean))),
    externalRefs: refs,
    refKey: refKeyFor(type, canonicalName, refs),
    therapeuticArea,
    summary,
  };
}

export async function resolveCentral(t: WatchTargetLike): Promise<ResolvedCentral> {
  const aliases = [...(t.aliases ?? [])];
  if (t.company) aliases.push(t.company);

  if (t.type === "target") {
    const entry: UniProtEntry | null = await searchTarget(t.name || t.displayName);
    if (entry) {
      const refs = uniprotRefs(entry);
      const canonical = entry.geneSymbol || t.name || entry.displayName;
      const allAliases = Array.from(new Set([canonical, t.name, t.displayName, ...aliases, ...entry.aliases]))
        .filter((a) => a && a.toLowerCase() !== canonical.toLowerCase());
      return {
        central: spec("target", canonical, t.displayName, refs, allAliases, t.therapeuticArea, entry.summary),
        ensemblId: entry.ensembl,
      };
    }
  }

  if (t.type === "drug") {
    const mol: ChEMBLMolecule | null = await searchMolecule(t.name || t.displayName);
    if (mol) {
      const refs: ExternalRefs = { chembl: mol.chemblId };
      const canonical = t.name || mol.name;
      const allAliases = Array.from(new Set([t.displayName, mol.name, ...mol.synonyms]))
        .filter((a) => a && a.toLowerCase() !== canonical.toLowerCase());
      const summary =
        mol.maxPhase >= 1 ? `Clinical candidate (ChEMBL max phase ${mol.maxPhase})` : undefined;
      return {
        central: spec("drug", canonical, t.displayName, refs, allAliases, t.therapeuticArea, summary),
      };
    }
  }

  if (t.type === "company") {
    try {
      const sec = await resolveCompanyToSEC(t.company || t.name || t.displayName);
      if (sec) {
        const refs: ExternalRefs = { secCik: sec.cik };
        const canonical = sec.displayName || t.name;
        return {
          central: spec("company", canonical, t.displayName || sec.title, refs, aliases, t.therapeuticArea),
        };
      }
    } catch {
      // SEC lookup failure → fall through to name-based entity (best-effort, R-KG-5).
    }
  }

  // Fallback: name-based entity (still deduped across workspaces by name+type).
  return {
    central: spec(t.type, t.name || t.displayName, t.displayName, {}, aliases, t.therapeuticArea),
  };
}
