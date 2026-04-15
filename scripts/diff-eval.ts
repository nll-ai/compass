/**
 * Offline diff eval CLI for Decision Digest-style summaries.
 *
 * Usage:
 *   npx tsx scripts/diff-eval.ts capture --source pubmed --query "Pembrolizumab NSCLC" \
 *     --start-date 2024-01-01 --end-date 2024-06-30 --out-dir ./tmp/window-a
 *   npx tsx scripts/diff-eval.ts capture --source pubmed --target-json ./eval/diff/fixtures/sample-target.json \
 *     --start-date 2024-01-01 --end-date 2024-06-30 --out-dir ./tmp/window-a
 *   npx tsx scripts/diff-eval.ts capture ... --mindate ... --maxdate ... --out ./tmp/a.txt
 *   npx tsx scripts/diff-eval.ts make-case --case-id my_case --before ./tmp/a.txt --after ./tmp/b.txt [--metadata ./meta.yaml]
 *   npx tsx scripts/diff-eval.ts run --case-id my_case [--model gpt-4o-mini]
 *   npx tsx scripts/diff-eval.ts run --all --limit 5
 *   npx tsx scripts/diff-eval.ts score --run-dir ./eval/diff/runs/<ts> [--no-judge] [--judge-model gpt-4o-mini]
 *   npx tsx scripts/diff-eval.ts report --run-dir ./eval/diff/runs/<ts>
 *
 * Env: GROQ_API_KEY in .env.local (for run; for score with judge). PUBMED_API_KEY optional for capture.
 */

import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  existsSync,
  copyFileSync,
  mkdtempSync,
  rmSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { stringify as stringifyYaml } from "yaml";
import type { ScanTarget, ScanOptions, TherapeuticArea } from "../lib/scan/types";
import { capturePubMedSnapshotText } from "../lib/scan/sources/pubmed";
import { runDiffSummaryFromTexts } from "../lib/eval/diff/runDiffSummary";
import { scoreDeterministic } from "../lib/eval/diff/scoreCase";
import { loadExpectedChanges, loadExpectedSummaryMarkdown } from "../lib/eval/diff/caseFiles";
import { judgeDiffSummary } from "../lib/eval/diff/judgeDiffSummary";
import type { DiffSummaryModelOutput } from "../lib/eval/diff/types";
import type { JudgeScoreResult } from "../lib/eval/diff/judgeDiffSummary";

const ROOT = process.cwd();
const CASES_DIR = join(ROOT, "eval", "diff", "cases");
const RUNS_DIR = join(ROOT, "eval", "diff", "runs");
const FIXTURES_DIR = join(ROOT, "eval", "diff", "fixtures");

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
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

function parseArgs(argv: string[]): { cmd: string; flags: Record<string, string> } {
  const [, , cmd, ...rest] = argv;
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next != null && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    }
  }
  return { cmd: cmd ?? "", flags };
}

async function cmdCapture(flags: Record<string, string>): Promise<void> {
  const source = flags.source ?? "pubmed";
  let targetPath = flags["target-json"];
  const targetId = flags["target-id"];
  const query = flags.query;
  const mindate = flags.mindate ?? flags["start-date"];
  const maxdate = flags.maxdate ?? flags["end-date"];
  const out = flags.out;
  const outDir = flags["out-dir"];

  if (source !== "pubmed") {
    console.error("capture: only --source pubmed is supported in MVP");
    process.exit(1);
  }

  let queryTempDir: string | null = null;
  if (query && (targetPath || targetId)) {
    console.warn("capture: ignoring --query because --target-json or --target-id is set");
  } else if (query && !targetPath && !targetId) {
    const sample = join(FIXTURES_DIR, "sample-target.json");
    if (!existsSync(sample)) {
      console.error("capture: --query requires eval/diff/fixtures/sample-target.json");
      process.exit(1);
    }
    const base = JSON.parse(readFileSync(sample, "utf8")) as Record<string, unknown>;
    const slug =
      query
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 80) || "query_target";
    queryTempDir = mkdtempSync(join(tmpdir(), "diff-capture-"));
    targetPath = join(queryTempDir, "target.json");
    writeFileSync(
      targetPath,
      JSON.stringify(
        {
          ...base,
          name: slug,
          displayName: query,
        },
        null,
        2,
      ),
      "utf8",
    );
  }
  if (!targetPath && targetId) {
    targetPath = join(FIXTURES_DIR, `${targetId}.json`);
  }
  if (!targetPath || !mindate || !maxdate) {
    console.error(
      "capture requires --target-json, --target-id, or --query (with sample-target.json), plus dates (--mindate/--maxdate or --start-date/--end-date, YYYY-MM-DD)",
    );
    process.exit(1);
  }
  if (!existsSync(targetPath)) {
    console.error("target file not found:", targetPath);
    process.exit(1);
  }

  let outPath = out;
  if (!outPath) {
    if (!outDir) {
      console.error("capture requires --out (file) or --out-dir (writes snapshot.txt)");
      process.exit(1);
    }
    mkdirSync(outDir, { recursive: true });
    outPath = join(outDir, "snapshot.txt");
  } else if (outDir) {
    console.warn("Ignoring --out-dir because --out is set");
  } else {
    mkdirSync(join(outPath, ".."), { recursive: true });
  }

  try {
    const raw = JSON.parse(readFileSync(targetPath, "utf8")) as {
      name: string;
      displayName: string;
      aliases?: string[];
      type?: ScanTarget["type"];
      therapeuticArea?: TherapeuticArea;
      _id?: string;
    };
    const target: ScanTarget = {
      _id: (raw._id ?? "eval_capture_target") as ScanTarget["_id"],
      name: raw.name,
      displayName: raw.displayName,
      aliases: raw.aliases ?? [],
      type: raw.type ?? "drug",
      therapeuticArea: raw.therapeuticArea ?? "other",
    };
    const scanOptions: ScanOptions = {
      mode: "comprehensive",
      pubmedPubDate: { mode: "range", mindate, maxdate },
    };
    const env = { PUBMED_API_KEY: process.env.PUBMED_API_KEY };
    const { text, error } = await capturePubMedSnapshotText({ target, scanOptions, env });
    if (error && !text) {
      console.error("capture failed:", error);
      process.exit(1);
    }
    writeFileSync(outPath!, text, "utf8");
    console.log("Wrote", outPath, `(${text.length} chars)`);
  } finally {
    if (queryTempDir) {
      try {
        rmSync(queryTempDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

function cmdMakeCase(flags: Record<string, string>): void {
  const caseId = flags["case-id"];
  const before = flags.before;
  const after = flags.after;
  const metadataSrc = flags.metadata;
  if (!caseId || !before || !after) {
    console.error("make-case requires --case-id --before --after");
    process.exit(1);
  }
  const dir = join(CASES_DIR, caseId);
  mkdirSync(dir, { recursive: true });
  copyFileSync(before, join(dir, "before.txt"));
  copyFileSync(after, join(dir, "after.txt"));

  if (metadataSrc) {
    if (!existsSync(metadataSrc)) {
      console.error("metadata file not found:", metadataSrc);
      process.exit(1);
    }
    const lower = metadataSrc.toLowerCase();
    const dest =
      lower.endsWith(".yaml") || lower.endsWith(".yml")
        ? join(dir, "metadata.yaml")
        : join(dir, "metadata.json");
    copyFileSync(metadataSrc, dest);
  } else {
    const metaPathYaml = join(dir, "metadata.yaml");
    if (!existsSync(metaPathYaml) && !existsSync(join(dir, "metadata.json"))) {
      writeFileSync(
        metaPathYaml,
        stringifyYaml(
          {
            source: "pubmed",
            difficulty: "medium",
            change_types: [],
          },
          { lineWidth: 0 },
        ),
        "utf8",
      );
    }
  }

  const expYaml = join(dir, "expected_changes.yaml");
  const expJson = join(dir, "expected_changes.json");
  if (!existsSync(expYaml) && !existsSync(expJson)) {
    writeFileSync(
      expYaml,
      stringifyYaml({ must_mention: [], must_not_mention: [], expected_facts: [] }, { lineWidth: 0 }),
      "utf8",
    );
  }

  const summaryPath = join(dir, "expected_summary.md");
  if (!existsSync(summaryPath)) {
    writeFileSync(
      summaryPath,
      "# Expected summary rubric\n\nOptional gold notes for the LLM judge (faithfulness, materiality).\n",
      "utf8",
    );
  }

  console.log("Case folder ready:", dir);
}

async function cmdRun(flags: Record<string, string>): Promise<void> {
  const caseId = flags["case-id"];
  const all = flags.all === "true";
  const limit = flags.limit ? parseInt(flags.limit, 10) : 100;
  const model = flags.model;
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    console.error("GROQ_API_KEY required for run");
    process.exit(1);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = join(RUNS_DIR, ts);
  mkdirSync(runDir, { recursive: true });

  let caseIds: string[] = [];
  if (all) {
    if (!existsSync(CASES_DIR)) {
      console.error("No cases dir:", CASES_DIR);
      process.exit(1);
    }
    caseIds = readdirSync(CASES_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .slice(0, limit);
  } else if (caseId) {
    caseIds = [caseId];
  } else {
    console.error("run requires --case-id or --all");
    process.exit(1);
  }

  const results: Record<string, DiffSummaryModelOutput> = {};
  for (const id of caseIds) {
    const dir = join(CASES_DIR, id);
    const b = join(dir, "before.txt");
    const a = join(dir, "after.txt");
    if (!existsSync(b) || !existsSync(a)) {
      console.warn("skip (missing before/after):", id);
      continue;
    }
    const beforeText = readFileSync(b, "utf8");
    const afterText = readFileSync(a, "utf8");
    const out = await runDiffSummaryFromTexts({
      beforeText,
      afterText,
      groqApiKey: key,
      model,
    });
    results[id] = out;
    mkdirSync(join(runDir, "outputs"), { recursive: true });
    writeFileSync(join(runDir, "outputs", `${id}.json`), JSON.stringify(out, null, 2), "utf8");
  }
  writeFileSync(join(runDir, "results.json"), JSON.stringify(results, null, 2), "utf8");
  console.log("Run written to", runDir);
}

type CaseScore = {
  deterministic: ReturnType<typeof scoreDeterministic>;
  judge?: JudgeScoreResult;
  /** 0.5 * deterministic + 0.5 * judge when judge present; else deterministic only */
  composite: number;
};

async function cmdScore(flags: Record<string, string>): Promise<void> {
  const runDir = flags["run-dir"];
  if (!runDir) {
    console.error("score requires --run-dir");
    process.exit(1);
  }
  const noJudge = flags["no-judge"] === "true";
  const judgeModel = flags["judge-model"];
  const key = process.env.GROQ_API_KEY;

  if (!noJudge && !key) {
    console.error("GROQ_API_KEY required for score unless --no-judge");
    process.exit(1);
  }

  const resultsPath = join(runDir, "results.json");
  if (!existsSync(resultsPath)) {
    console.error("missing results.json in", runDir);
    process.exit(1);
  }
  const results = JSON.parse(readFileSync(resultsPath, "utf8")) as Record<string, DiffSummaryModelOutput>;
  const scored: Record<string, CaseScore> = {};

  for (const [id, output] of Object.entries(results)) {
    const caseDir = join(CASES_DIR, id);
    const bPath = join(caseDir, "before.txt");
    const aPath = join(caseDir, "after.txt");
    let beforeText = "";
    let afterText = "";
    if (existsSync(bPath) && existsSync(aPath)) {
      beforeText = readFileSync(bPath, "utf8");
      afterText = readFileSync(aPath, "utf8");
    }
    const expected = loadExpectedChanges(caseDir);
    const det = scoreDeterministic(output, expected, { beforeText, afterText });
    let judge: JudgeScoreResult | undefined;
    if (!noJudge && key && beforeText && afterText) {
      const rubricHint = loadExpectedSummaryMarkdown(caseDir) ?? undefined;
      judge = await judgeDiffSummary({
        beforeText,
        afterText,
        modelOutput: output,
        rubricHint,
        groqApiKey: key,
        model: judgeModel,
      });
    }
    const composite = judge ? 0.5 * det.score + 0.5 * judge.judgeScore : det.score;
    scored[id] = { deterministic: det, judge, composite };
  }

  writeFileSync(join(runDir, "scores.json"), JSON.stringify(scored, null, 2), "utf8");
  console.log("Scores written to", join(runDir, "scores.json"));
}

function cmdReport(flags: Record<string, string>): void {
  const runDir = flags["run-dir"];
  if (!runDir) {
    console.error("report requires --run-dir");
    process.exit(1);
  }
  const scoresPath = join(runDir, "scores.json");
  if (!existsSync(scoresPath)) {
    console.error("Run score first; missing scores.json");
    process.exit(1);
  }
  const resultsPath = join(runDir, "results.json");
  const results = existsSync(resultsPath)
    ? (JSON.parse(readFileSync(resultsPath, "utf8")) as Record<string, DiffSummaryModelOutput>)
    : {};

  const scores = JSON.parse(readFileSync(scoresPath, "utf8")) as Record<string, CaseScore>;
  const lines: string[] = ["# Diff eval scorecard", ""];

  const caseReportsDir = join(runDir, "case_reports");
  mkdirSync(caseReportsDir, { recursive: true });

  let sumComp = 0;
  let n = 0;
  for (const [id, s] of Object.entries(scores)) {
    lines.push(`## ${id}`);
    lines.push(`- deterministic score: ${s.deterministic.score.toFixed(3)}`);
    lines.push(`- must_mention: ${s.deterministic.mustMentionHits}/${s.deterministic.mustMentionTotal}`);
    lines.push(`- must_not violations: ${s.deterministic.mustNotViolations}`);
    if (s.deterministic.factRecall != null) {
      lines.push(`- fact recall: ${s.deterministic.factRecall.toFixed(3)} (expected facts: ${s.deterministic.expectedFactsTotal ?? 0})`);
    }
    if (s.deterministic.factPrecision != null) {
      lines.push(
        `- fact precision: ${s.deterministic.factPrecision.toFixed(3)} (predicted: ${s.deterministic.predictedFactsTotal ?? 0}, unsupported claims: ${s.deterministic.unsupportedClaimCount ?? 0})`,
      );
    }
    if (s.judge) {
      lines.push(
        `- judge: faithfulness=${s.judge.faithfulness} materiality=${s.judge.materiality} concision=${s.judge.concision} actionability=${s.judge.actionability} (judgeScore=${s.judge.judgeScore.toFixed(3)})`,
      );
    } else {
      lines.push(`- judge: skipped`);
    }
    lines.push(`- **composite:** ${s.composite.toFixed(3)}`);
    lines.push("");
    sumComp += s.composite;
    n += 1;

    const outJson = results[id];
    const reportLines = [`# Case report: ${id}`, ""];
    reportLines.push("## Composite score", String(s.composite.toFixed(3)), "");
    reportLines.push("## Deterministic", "```json", JSON.stringify(s.deterministic, null, 2), "```", "");
    if (s.judge) {
      reportLines.push("## Judge", "```json", JSON.stringify(s.judge, null, 2), "```", "");
    }
    if (outJson) {
      reportLines.push("## Model output", "```json", JSON.stringify(outJson, null, 2), "```", "");
    }
    writeFileSync(join(caseReportsDir, `${id}.md`), reportLines.join("\n"), "utf8");
  }

  if (n > 0) {
    lines.push(`## Mean composite score: ${(sumComp / n).toFixed(3)}`);
  }
  const md = lines.join("\n");
  writeFileSync(join(runDir, "scorecard.md"), md, "utf8");
  console.log(md);
}

async function main(): Promise<void> {
  loadEnvLocal();
  const { cmd, flags } = parseArgs(process.argv);
  switch (cmd) {
    case "capture":
      await cmdCapture(flags);
      break;
    case "make-case":
      cmdMakeCase(flags);
      break;
    case "run":
      await cmdRun(flags);
      break;
    case "score":
      await cmdScore(flags);
      break;
    case "report":
      cmdReport(flags);
      break;
    default:
      console.error(
        "Commands: capture | make-case | run | score | report. See script header for flags.",
      );
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
