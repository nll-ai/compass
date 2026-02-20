import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { runAllSources, type SourceName } from "../../../lib/scan/sources";
import { generateDigest } from "../../../lib/scan/digest";
import type { ScanOptions, ScanTarget } from "../../../lib/scan/types";

const SOURCES: SourceName[] = ["pubmed", "clinicaltrials", "edgar", "exa", "openfda", "rss", "patents"];

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
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { scanRunId: bodyScanRunId, period, targetIds, mode } = body;
    if (!period || (period !== "daily" && period !== "weekly")) {
      return NextResponse.json({ error: "period required: daily | weekly" }, { status: 400 });
    }
    const scanMode = mode === "comprehensive" ? "comprehensive" : "latest";
    const scanOptions: ScanOptions = { mode: scanMode };

    const client = new ConvexHttpClient(convexUrl);

  let scanRunId: Id<"scanRuns">;
  if (bodyScanRunId) {
    scanRunId = bodyScanRunId as Id<"scanRuns">;
  } else {
    const ids = targetIds?.length ? (targetIds as Id<"watchTargets">[]) : undefined;
    scanRunId = await client.mutation(api.scans.createRunForServer, {
      secret: effectiveSecret,
      period,
      targetIds: ids,
    });
  }

  const targets = targetIds?.length
    ? await client.query(api.watchTargets.getByIds, { ids: targetIds as Id<"watchTargets">[] })
    : await client.query(api.watchTargets.listActive, {});

  if (targets.length === 0) {
    await client.mutation(api.scans.updateScanStatusFromServer, {
      secret: effectiveSecret,
      scanRunId,
      status: "completed",
      completedAt: Date.now(),
      sourcesCompleted: SOURCES.length,
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

  const sourceResults = await runAllSources(scanTargets, env, scanOptions);

  let totalFound = 0;
  let newFound = 0;

  for (const source of SOURCES) {
    const result = sourceResults[source];
    await client.mutation(api.scans.updateSourceStatusFromServer, {
      secret: effectiveSecret,
      scanRunId,
      source,
      status: "running",
      startedAt: Date.now(),
    });
    if (result.error) {
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
    const { totalFound: t, newFound: n } = await client.mutation(api.rawItems.upsertRawItemsFromServer, {
      secret: effectiveSecret,
      scanRunId,
      source,
      items: result.items.map((i) => ({ ...i, metadata: i.metadata ?? {} })),
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
    sourcesCompleted: SOURCES.length,
    totalItemsFound: totalFound,
    newItemsFound: newFound,
  });

  const scan = await client.query(api.scans.get, { id: scanRunId });
  if (newFound > 0 || scan?.period === "weekly") {
    const newItems = await client.query(api.rawItems.getNewByScanRunFromServer, { secret: effectiveSecret, scanRunId });
    const targetNames = new Map(scanTargets.map((t) => [t._id, t.displayName]));
    const feedbackContext = await client.query(api.digestItems.getFeedbackForPrompt, { limit: 40 });
    const payload = await generateDigest(
      newItems,
      (scan?.period as "daily" | "weekly") ?? "daily",
      targetNames,
      env.OPENAI_API_KEY,
      feedbackContext
    );
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
    });
  }

  return NextResponse.json({ ok: true, scanRunId, totalFound, newFound });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
