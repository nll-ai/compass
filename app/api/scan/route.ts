import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { runAllSources } from "../../../lib/scan/sources";
import { filterRelevantItems } from "../../../lib/scan/relevance-filter";
import { enrichMissingSummaries } from "../../../lib/scan/summary-enrichment";
import { ALL_SOURCE_IDS } from "../../../lib/sources/registry";
import { generateDigest, generateDigestWithAI, type DigestTargetInfo } from "../../../lib/scan/digest";
import type { ScanOptions, ScanTarget } from "../../../lib/scan/types";

/** Allow long comprehensive runs (Vercel Pro supports up to 300s per route). */
export const maxDuration = 300;

function getSecret(): string | undefined {
  return process.env.SCAN_SECRET;
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  // Same-origin requests often have no Origin (e.g. form POST from same site), or Origin/Referer match our app
  if (!origin && !referer) return true; // e.g. fetch from same origin in dev
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const allowed = new URL(appUrl).origin;
  if (origin && new URL(origin).origin === allowed) return true;
  if (referer && new URL(referer).origin === allowed) return true;
  if (origin && (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"))) return true;
  if (referer && (referer.startsWith("http://localhost:") || referer.startsWith("http://127.0.0.1:"))) return true;
  return false;
}

export async function POST(request: Request) {
  try {
    const secret = getSecret();
    if (!secret) {
      return NextResponse.json({ error: "SCAN_SECRET not configured" }, { status: 500 });
    }
    const auth = request.headers.get("Authorization");
    const allowed = auth === `Bearer ${secret}` || isSameOrigin(request);
    if (!allowed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Use server secret for Convex calls (same-origin requests don't send the token)
    const effectiveSecret = secret;

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return NextResponse.json({ error: "NEXT_PUBLIC_CONVEX_URL not configured" }, { status: 500 });
    }

    let body: {
      scanRunId?: string;
      period: "daily" | "weekly";
      targetIds?: string[];
      mode?: "latest" | "comprehensive";
      sources?: string[];
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { scanRunId: bodyScanRunId, period, targetIds, mode, sources: bodySources } = body;
    if (!period || (period !== "daily" && period !== "weekly")) {
      return NextResponse.json({ error: "period required: daily | weekly" }, { status: 400 });
    }
    const scanMode = mode === "comprehensive" ? "comprehensive" : "latest";
    const scanOptions: ScanOptions = { mode: scanMode };

    const client = new ConvexHttpClient(convexUrl);

  const sourceIdsToRun =
    bodySources?.length &&
    bodySources.every((s) => ALL_SOURCE_IDS.includes(s as (typeof ALL_SOURCE_IDS)[number]))
      ? (bodySources as (typeof ALL_SOURCE_IDS)[number][])
      : undefined;

  let scanRunId: Id<"scanRuns">;
  if (bodyScanRunId) {
    scanRunId = bodyScanRunId as Id<"scanRuns">;
  } else {
    const ids = targetIds?.length ? (targetIds as Id<"watchTargets">[]) : undefined;
    scanRunId = await client.mutation(api.scans.createRunForServer, {
      secret: effectiveSecret,
      period,
      targetIds: ids,
      sourceIds: sourceIdsToRun,
    });
  }

  const targets = targetIds?.length
    ? await client.query(api.watchTargets.getByIds, { ids: targetIds as Id<"watchTargets">[] })
    : await client.query(api.watchTargets.listActive, {});

  const sourcesRan = sourceIdsToRun ?? [...ALL_SOURCE_IDS];

  if (targets.length === 0) {
    await client.mutation(api.scans.updateScanStatusFromServer, {
      secret: effectiveSecret,
      scanRunId,
      status: "completed",
      completedAt: Date.now(),
      sourcesCompleted: sourcesRan.length,
      totalItemsFound: 0,
      newItemsFound: 0,
    });
    return NextResponse.json({ ok: true, scanRunId, message: "No watch targets" });
  }

  const scanTargets: ScanTarget[] = targets.map((t) => ({
    _id: t._id,
    name: t.name,
    displayName: t.displayName,
    aliases: t.aliases,
    therapeuticArea: t.therapeuticArea,
    type: t.type,
    indication: t.indication,
    company: t.company,
    notes: t.notes ?? undefined,
    learnedQueryTerms: t.learnedQueryTerms ?? [],
    excludeQueryTerms: t.excludeQueryTerms ?? [],
  }));

  const env = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    EXA_API_KEY: process.env.EXA_API_KEY,
    PUBMED_API_KEY: process.env.PUBMED_API_KEY,
    PATENTSVIEW_API_KEY: process.env.PATENTSVIEW_API_KEY,
  };

  await client.mutation(api.scans.updateScanStatusFromServer, {
    secret: effectiveSecret,
    scanRunId,
    status: "running",
    startedAt: Date.now(),
  });

  const existingExternalIdsBySource = await client.query(api.rawItems.getExistingExternalIdsFromServer, {
    secret: effectiveSecret,
    sources: sourcesRan,
  });

  const sourceResults = await runAllSources(scanTargets, env, {
    ...scanOptions,
    period,
    sources: sourceIdsToRun,
    existingExternalIdsBySource: existingExternalIdsBySource as Record<string, string[]>,
  });

  let totalFound = 0;
  let newFound = 0;
  const failedSources: Record<string, string> = {};

  for (const source of sourcesRan) {
    const result = sourceResults[source];
    await client.mutation(api.scans.updateSourceStatusFromServer, {
      secret: effectiveSecret,
      scanRunId,
      source,
      status: "running",
      startedAt: Date.now(),
    });
    if (result.error) {
      failedSources[source] = result.error;
      await client.mutation(api.scans.updateSourceStatusFromServer, {
        secret: effectiveSecret,
        scanRunId,
        source,
        status: "failed",
        itemsFound: 0,
        completedAt: Date.now(),
        error: result.error,
      });
      continue;
    }
    const relevantItems = await filterRelevantItems(
      result.items,
      scanTargets,
      env.OPENAI_API_KEY
    );
    const itemsToUpsert = await enrichMissingSummaries(
      relevantItems,
      source,
      env.OPENAI_API_KEY
    );
    const { totalFound: t, newFound: n } = await client.mutation(api.rawItems.upsertRawItemsFromServer, {
      secret: effectiveSecret,
      scanRunId,
      source,
      items: itemsToUpsert.map((i) => ({ ...i, metadata: i.metadata ?? {} })),
    });
    totalFound += t;
    newFound += n;
    await client.mutation(api.scans.updateSourceStatusFromServer, {
      secret: effectiveSecret,
      scanRunId,
      source,
      status: "completed",
      itemsFound: t,
      completedAt: Date.now(),
    });
  }

  await client.mutation(api.scans.updateScanStatusFromServer, {
    secret: effectiveSecret,
    scanRunId,
    status: "completed",
    completedAt: Date.now(),
    sourcesCompleted: sourcesRan.length,
    totalItemsFound: totalFound,
    newItemsFound: newFound,
  });

  const scan = await client.query(api.scans.get, { id: scanRunId });
  if (newFound > 0 || scan?.period === "weekly") {
    const newItems = await client.query(api.rawItems.getNewByScanRunFromServer, { secret: effectiveSecret, scanRunId });
    const feedbackContext = await client.query(api.digestItems.getFeedbackForPrompt, { limit: 40 });
    const digestTargets: DigestTargetInfo[] = scanTargets.map((t) => ({
      _id: t._id,
      displayName: t.displayName,
      type: t.type,
      therapeuticArea: t.therapeuticArea,
      indication: t.indication,
      notes: t.notes,
    }));
    const payload = env.OPENAI_API_KEY
      ? await generateDigestWithAI(
          newItems,
          (scan?.period as "daily" | "weekly") ?? "daily",
          digestTargets,
          env.OPENAI_API_KEY,
          feedbackContext
        )
      : await generateDigest(
          newItems,
          (scan?.period as "daily" | "weekly") ?? "daily",
          new Map(scanTargets.map((t) => [t._id, t.displayName])),
          env.OPENAI_API_KEY,
          feedbackContext
        );
    const rawItemIds = payload.items.flatMap((i) => i.rawItemIds);
    const sourceLinksHash =
      rawItemIds.length > 0
        ? createHash("sha256").update([...rawItemIds].sort().join(",")).digest("hex")
        : undefined;
    const existingReport =
      sourceLinksHash != null
        ? await client.query(api.digestRuns.getBySourceLinksHash, { sourceLinksHash })
        : null;
    if (!existingReport) {
      await client.mutation(api.digests.createDigestRunWithItemsFromServer, {
        secret: effectiveSecret,
        scanRunId,
        period: (scan?.period as "daily" | "weekly") ?? "daily",
        executiveSummary: payload.executiveSummary,
        criticalCount: payload.criticalCount,
        highCount: payload.highCount,
        mediumCount: payload.mediumCount,
        lowCount: payload.lowCount,
        items: payload.items,
        sourceLinksHash,
      });
    }
  }

  return NextResponse.json({ ok: true, scanRunId, totalFound, newFound, failedSources: Object.keys(failedSources).length ? failedSources : undefined });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
