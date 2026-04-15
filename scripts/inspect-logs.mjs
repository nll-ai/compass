#!/usr/bin/env node
/**
 * Print where to look for logs, or forward to `convex logs` with args.
 *
 * Usage:
 *   node scripts/inspect-logs.mjs
 *   node scripts/inspect-logs.mjs convex --history 100
 *   node scripts/inspect-logs.mjs convex --history 200 --jsonl
 *   node scripts/inspect-logs.mjs convex --prod --history 50
 *
 * npm equivalents:
 *   npm run convex:logs
 *   npm run convex:logs -- --history 100 --jsonl
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const HELP = `
Compass — where to look for logs
================================

Next.js (API routes, /api/scan, /api/digest/backfill-decision, Groq calls)
  → Terminal where you run: npm run dev

Convex (queries/mutations; errors like [Request ID: …] Server Error)
  → Stream (dev deployment linked from this repo):
       npm run convex:logs
  → Last N log lines (good after reproducing an error):
       npm run convex:logs -- --history 100
  → JSONL for ripgrep / jq (search by Request ID or function name):
       npm run convex:logs -- --history 200 --jsonl | rg YOUR_REQUEST_ID
       npm run convex:logs -- --history 200 --jsonl | rg digestRuns|digests|backfill
  → Production deployment:
       npm run convex:logs:prod
  → Web UI: https://dashboard.convex.dev → your project → Logs

This script (forward to Convex CLI):
  node scripts/inspect-logs.mjs convex --history 80
  node scripts/inspect-logs.mjs convex --history 100 --jsonl
`;

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "-h" || argv[0] === "--help") {
    console.log(HELP.trim());
    process.exit(0);
  }

  if (argv[0] !== "convex") {
    console.error('Unknown command. First argument must be "convex" or use --help.\n');
    console.log(HELP.trim());
    process.exit(1);
  }

  const convexArgs = argv.slice(1);
  const child = spawn("npx", ["convex", "logs", ...convexArgs], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  child.on("exit", (code, signal) => {
    if (signal) process.exit(1);
    process.exit(code ?? 0);
  });
}

main();
