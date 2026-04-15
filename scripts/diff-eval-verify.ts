/**
 * Plan Step 10: verify corpus size and optionally run diff-eval pipeline end-to-end.
 *
 *   npx tsx scripts/diff-eval-verify.ts              # only checks case count + files
 *   npx tsx scripts/diff-eval-verify.ts --with-llm  # also run → score --no-judge → report (needs GROQ_API_KEY)
 */

import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
const CASES_DIR = join(ROOT, "eval", "diff", "cases");
const RUNS_DIR = join(ROOT, "eval", "diff", "runs");

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

function validCaseIds(): string[] {
  if (!existsSync(CASES_DIR)) return [];
  return readdirSync(CASES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name)
    .filter((id) => {
      const dir = join(CASES_DIR, id);
      return existsSync(join(dir, "before.txt")) && existsSync(join(dir, "after.txt"));
    });
}

function latestRunDir(): string | null {
  if (!existsSync(RUNS_DIR)) return null;
  const dirs = readdirSync(RUNS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "node_modules")
    .map((d) => d.name)
    .filter((name) => {
      try {
        return statSync(join(RUNS_DIR, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort()
    .reverse();
  return dirs.length > 0 ? join(RUNS_DIR, dirs[0]!) : null;
}

function main(): void {
  loadEnvLocal();
  const ids = validCaseIds();
  const min = 15;
  if (ids.length < min) {
    console.error(`diff-eval-verify: need at least ${min} cases with before.txt+after.txt; found ${ids.length}`);
    console.error("Run: npx tsx scripts/seed-diff-eval-corpus.ts");
    process.exit(1);
  }
  console.log(`diff-eval-verify: ${ids.length} cases OK.`);

  const withLlm = process.argv.includes("--with-llm");
  if (!withLlm) {
    console.log("Skip LLM pipeline (pass --with-llm to run run → score → report).");
    return;
  }
  if (!process.env.GROQ_API_KEY) {
    console.error("GROQ_API_KEY required for --with-llm");
    process.exit(1);
  }
  execSync(`npx tsx scripts/diff-eval.ts run --all --limit 50`, { cwd: ROOT, stdio: "inherit", env: process.env });
  const runDir = latestRunDir();
  if (!runDir || !existsSync(join(runDir, "results.json"))) {
    console.error("No run results found.");
    process.exit(1);
  }
  execSync(`npx tsx scripts/diff-eval.ts score --run-dir "${runDir}" --no-judge`, {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  execSync(`npx tsx scripts/diff-eval.ts report --run-dir "${runDir}"`, {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  const scorecard = join(runDir, "scorecard.md");
  if (!existsSync(scorecard) || readFileSync(scorecard, "utf8").trim().length < 20) {
    console.error("scorecard.md missing or empty");
    process.exit(1);
  }
  console.log("diff-eval-verify: LLM pipeline OK:", runDir);
}

main();
