import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import type { DiffEvalCaseMetadata, ExpectedChanges } from "./types";

function parseYamlRecord(raw: string): Record<string, unknown> {
  const doc = parseYaml(raw);
  if (doc == null || typeof doc !== "object" || Array.isArray(doc)) {
    return {};
  }
  return doc as Record<string, unknown>;
}

/**
 * Load expected substring checks: prefers `expected_changes.yaml`, falls back to `expected_changes.json`.
 */
export function loadExpectedChanges(caseDir: string): ExpectedChanges {
  const yamlPath = join(caseDir, "expected_changes.yaml");
  const jsonPath = join(caseDir, "expected_changes.json");
  if (existsSync(yamlPath)) {
    const rec = parseYamlRecord(readFileSync(yamlPath, "utf8"));
    return {
      must_mention: asStringArray(rec.must_mention),
      must_not_mention: asStringArray(rec.must_not_mention),
      expected_facts: asStringArray(rec.expected_facts),
    };
  }
  if (existsSync(jsonPath)) {
    return JSON.parse(readFileSync(jsonPath, "utf8")) as ExpectedChanges;
  }
  return {};
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is string => typeof x === "string");
}

/**
 * Load case metadata: prefers `metadata.yaml`, falls back to `metadata.json`.
 */
export function loadCaseMetadata(caseDir: string): DiffEvalCaseMetadata | null {
  const yamlPath = join(caseDir, "metadata.yaml");
  const jsonPath = join(caseDir, "metadata.json");
  if (existsSync(yamlPath)) {
    const rec = parseYamlRecord(readFileSync(yamlPath, "utf8"));
    return normalizeMetadata(rec);
  }
  if (existsSync(jsonPath)) {
    return normalizeMetadata(JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, unknown>);
  }
  return null;
}

function normalizeMetadata(rec: Record<string, unknown>): DiffEvalCaseMetadata {
  const date_window = rec.date_window;
  return {
    source: typeof rec.source === "string" ? rec.source : "unknown",
    difficulty: typeof rec.difficulty === "string" ? rec.difficulty : undefined,
    change_types: asStringArray(rec.change_types),
    date_window:
      date_window != null && typeof date_window === "object" && !Array.isArray(date_window)
        ? (date_window as DiffEvalCaseMetadata["date_window"])
        : undefined,
    ground_truth_notes: typeof rec.ground_truth_notes === "string" ? rec.ground_truth_notes : undefined,
  };
}

/** Optional human rubric for the LLM judge (`expected_summary.md`). */
export function loadExpectedSummaryMarkdown(caseDir: string): string | null {
  const p = join(caseDir, "expected_summary.md");
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}
