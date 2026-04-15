/**
 * Backfill Decision Digest fields (delta, materiality, actions, confidence) on existing digest runs.
 *
 * Loads `.env.local` via Next env helper. Required env:
 *   SCAN_SECRET, NEXT_PUBLIC_CONVEX_URL, GROQ_API_KEY
 *
 * Usage:
 *   npx tsx scripts/backfill-decision-digest.ts
 *   npx tsx scripts/backfill-decision-digest.ts --limit 100
 *   npx tsx scripts/backfill-decision-digest.ts --digest-run-id jh70bgjpqancyn7
 *   npx tsx scripts/backfill-decision-digest.ts --force --limit 20   # newest 20, overwrite existing briefs
 */

import { loadEnvConfig } from "@next/env";
import type { Id } from "../convex/_generated/dataModel";
import { backfillDecisionDigestsBatch } from "../lib/scan/backfillDecisionDigest";

loadEnvConfig(process.cwd());

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

async function main() {
  const secret = process.env.SCAN_SECRET?.trim();
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!secret || !convexUrl || !groqKey) {
    console.error("Missing SCAN_SECRET, NEXT_PUBLIC_CONVEX_URL, or GROQ_API_KEY in environment.");
    process.exit(1);
  }

  const limitRaw = argValue("--limit");
  const limit = limitRaw ? Math.min(500, Math.max(1, parseInt(limitRaw, 10) || 50)) : 50;
  const digestRunId = argValue("--digest-run-id") as Id<"digestRuns"> | undefined;
  const force = process.argv.includes("--force");

  console.error(
    `Backfill decision digest: limit=${limit}${digestRunId ? ` digestRunId=${digestRunId}` : ""}${force ? " force=true" : ""}`,
  );

  const { results, summary } = await backfillDecisionDigestsBatch({
    convexUrl,
    secret,
    groqApiKey: groqKey,
    limit,
    digestRunId,
    force,
  });

  console.log(JSON.stringify({ summary, results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
