/**
 * Run SEC EDGAR retrieval for the eval target set and write outputs to eval/edgar/outputs/.
 *
 * Prerequisites:
 *   - .env.local with SEC_EDGAR_USER_AGENT (required). OPENAI_API_KEY optional (enables agent path).
 *
 * Usage:
 *   npx tsx scripts/run-edgar-eval.ts                    # run all targets in eval/edgar/targets.json
 *   npx tsx scripts/run-edgar-eval.ts <id> [id ...]     # run only the given target id(s), e.g. regeneron-pharma-npr1
 *
 * Outputs:
 *   eval/edgar/outputs/latest.json  - full result (timestamp, targets, edgar items, errors)
 *   eval/edgar/outputs/latest.md    - human-readable summary per target
 *
 * Assertions:
 *   - "Regeneron Pharmaceuticals" target (id: regeneron-pharma-npr1) must return at least one
 *     EDGAR item; each item must reference Regeneron/REGN and Regeneron's CIK (872589).
 */

/** Regeneron CIK (SEC Central Index Key); may appear as "872589" or "0000872589". */
const REGENERON_CIK = "872589";
const REGENERON_CIK_PADDED = "0000872589";
const REGENERON_PHARMA_TARGET_ID = "regeneron-pharma-npr1";

import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { Id } from "../convex/_generated/dataModel";
import { runAllSources } from "../lib/scan/sources";
import type { ScanTarget } from "../lib/scan/types";

const ROOT = join(process.cwd());
const EVAL_DIR = join(ROOT, "eval", "edgar");
const TARGETS_PATH = join(EVAL_DIR, "targets.json");
const OUTPUT_DIR = join(EVAL_DIR, "outputs");

function loadEnvLocal(): void {
  const envPath = join(ROOT, ".env.local");
  try {
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1).replace(/\\n/g, "\n");
      }
      process.env[key] = val;
    }
  } catch {
    // .env.local optional for CI; SEC_EDGAR_USER_AGENT may be set elsewhere
  }
}

interface EvalTargetSpec {
  id: string;
  name: string;
  displayName: string;
  type: "drug" | "target" | "company";
  company?: string;
  aliases: string[];
}

function loadEvalTargets(): EvalTargetSpec[] {
  const raw = readFileSync(TARGETS_PATH, "utf8");
  return JSON.parse(raw) as EvalTargetSpec[];
}

function toScanTarget(spec: EvalTargetSpec): ScanTarget {
  return {
    _id: `eval_${spec.id}` as Id<"watchTargets">,
    name: spec.name,
    displayName: spec.displayName,
    aliases: spec.aliases ?? [],
    type: spec.type,
    company: spec.company,
  };
}

function writeOutputs(
  runAt: string,
  targets: EvalTargetSpec[],
  edgarResult: { items: Array<{ watchTargetId: string; title: string; url: string; abstract?: string; externalId: string; metadata?: unknown }>; error?: string }
): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const jsonOut = {
    runAt,
    targetCount: targets.length,
    targets: targets.map((t) => ({ id: t.id, name: t.name, displayName: t.displayName, company: t.company })),
    edgar: {
      itemCount: edgarResult.items.length,
      error: edgarResult.error ?? null,
      items: edgarResult.items.map((i) => ({
        watchTargetId: i.watchTargetId,
        externalId: i.externalId,
        title: i.title,
        url: i.url,
        abstract: i.abstract ?? null,
        metadata: i.metadata ?? null,
      })),
    },
  };
  writeFileSync(join(OUTPUT_DIR, "latest.json"), JSON.stringify(jsonOut, null, 2), "utf8");

  const lines: string[] = [
    "# SEC EDGAR retrieval eval – latest run",
    "",
    `**Run at:** ${runAt}`,
    `**Targets:** ${targets.length}`,
    `**EDGAR items:** ${edgarResult.items.length}`,
    edgarResult.error ? `**Error:** ${edgarResult.error}` : "",
    "",
    "---",
    "",
  ];

  for (const spec of targets) {
    const tid = `eval_${spec.id}`;
    const items = edgarResult.items.filter((i) => i.watchTargetId === tid);
    const displayName = spec.displayName || spec.name;
    lines.push(`## ${displayName} (${spec.company ?? "—"})`);
    lines.push("");
    lines.push(`**Items:** ${items.length}`);
    lines.push("");
    if (items.length === 0) {
      lines.push("*No filings returned.*");
    } else {
      for (const item of items) {
        lines.push(`- [${item.title}](${item.url})`);
        if (item.abstract) lines.push(`  - ${item.abstract.slice(0, 200)}${item.abstract.length > 200 ? "…" : ""}`);
      }
    }
    lines.push("");
  }

  writeFileSync(join(OUTPUT_DIR, "latest.md"), lines.join("\n"), "utf8");
}

interface EdgarItemForAssertion {
  watchTargetId: string;
  title: string;
  metadata?: { company?: string; cik?: string; form?: string } | null;
}

/**
 * Explicit eval: "Regeneron Pharmaceuticals" (e.g. NPR1 drug target) must resolve to Regeneron
 * symbol (REGN) and return at least one 10-K/10-Q with correct CIK.
 */
function runRegeneronPharmaAssertions(
  specs: EvalTargetSpec[],
  edgarResult: { items: EdgarItemForAssertion[]; error?: string }
): { passed: boolean; message: string } {
  const spec = specs.find((s) => s.id === REGENERON_PHARMA_TARGET_ID);
  if (!spec) {
    return { passed: true, message: "No Regeneron Pharmaceuticals target in eval set (assertions skipped)." };
  }
  if (edgarResult.error) {
    return { passed: false, message: `EDGAR returned an error: ${edgarResult.error}` };
  }
  const watchTargetId = `eval_${REGENERON_PHARMA_TARGET_ID}`;
  const items = edgarResult.items.filter((i) => i.watchTargetId === watchTargetId);
  if (items.length === 0) {
    return {
      passed: false,
      message: `Regeneron Pharmaceuticals eval: expected ≥1 EDGAR item for ${watchTargetId}, got 0. Company "${spec.company}" should resolve to REGN and return 10-K/10-Q filings.`,
    };
  }
  const bad: string[] = [];
  for (const item of items) {
    const title = (item.title ?? "").toUpperCase();
    const company = (item.metadata?.company ?? "").toUpperCase();
    const rawCik = item.metadata?.cik ?? "";
    const cik = String(rawCik).replace(/^0+/, "") || String(rawCik);
    const hasRegeneronOrREGN = title.includes("REGENERON") || title.includes("REGN") || company.includes("REGENERON") || company.includes("REGN");
    if (!hasRegeneronOrREGN) {
      bad.push(`Item "${item.title}" has no Regeneron/REGN in title or metadata.company.`);
    }
    if (cik !== REGENERON_CIK) {
      bad.push(`Item "${item.title}" has metadata.cik=${item.metadata?.cik}, expected Regeneron CIK ${REGENERON_CIK_PADDED}.`);
    }
  }
  if (bad.length > 0) {
    return {
      passed: false,
      message: `Regeneron Pharmaceuticals eval failed:\n${bad.join("\n")}`,
    };
  }
  return {
    passed: true,
    message: `Regeneron Pharmaceuticals eval passed: ${items.length} item(s) for ${watchTargetId}, all reference Regeneron/REGN and CIK ${REGENERON_CIK_PADDED}.`,
  };
}

async function main(): Promise<void> {
  loadEnvLocal();

  const allSpecs = loadEvalTargets();
  const filterIds = process.argv.slice(2).map((a) => a.trim()).filter(Boolean);
  const specs = filterIds.length > 0
    ? allSpecs.filter((s) => filterIds.includes(s.id))
    : allSpecs;

  if (specs.length === 0) {
    if (filterIds.length > 0) {
      console.error("No matching targets for id(s):", filterIds.join(", "));
      console.error("Available ids:", allSpecs.map((s) => s.id).join(", "));
    } else {
      console.error("No targets in", TARGETS_PATH);
    }
    process.exit(1);
  }

  const targets: ScanTarget[] = specs.map(toScanTarget);

  const env: Record<string, string | undefined> = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    SEC_EDGAR_USER_AGENT: process.env.SEC_EDGAR_USER_AGENT,
  };

  const targetLabel = filterIds.length > 0 ? `target(s) ${specs.map((s) => s.id).join(", ")}` : `${targets.length} eval targets`;
  console.log("Running EDGAR retrieval for", targetLabel, "…");
  const results = await runAllSources(targets, env, {
    period: "daily",
    sources: ["edgar"],
    mode: "latest",
  });

  const edgar = results.edgar;
  const runAt = new Date().toISOString();
  writeOutputs(runAt, specs, {
    items: edgar.items,
    error: edgar.error,
  });

  const assertion = runRegeneronPharmaAssertions(specs, {
    items: edgar.items,
    error: edgar.error,
  });
  if (!assertion.passed) {
    console.error(assertion.message);
    process.exit(1);
  }
  console.log(assertion.message);

  console.log("Done. EDGAR items:", edgar.items.length, edgar.error ? `(error: ${edgar.error})` : "");
  console.log("Outputs:", join(OUTPUT_DIR, "latest.json"), "|", join(OUTPUT_DIR, "latest.md"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
