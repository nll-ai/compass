import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { runAllSources } from "./sources";
import { filterRelevantItems } from "./relevance-filter";
import { enrichMissingSummaries } from "./summary-enrichment";
import { ALL_SOURCE_IDS } from "../sources/registry";
import {
  generateDigest,
  generateDigestWithAI,
  type DigestTargetInfo,
  type PriorDigestDecisionContext,
} from "./digest";
import type { ScanOptions, ScanTarget } from "./types";
import type { FeedbackForMission } from "./agent-context";
import { normalizePubmedPubDateInput } from "./pubmed-esearch-dates";
import {
  isDecisionBriefEnabledByDefault,
  resolveDecisionBriefEnabled,
} from "../digestDecisionPreference";

/** Request body for `POST /api/scan` and shared pipeline (PubMed-only route uses the same shape with `sources`). */
export type ScanPostBody = {
  scanRunId?: string;
  period: "daily" | "weekly";
  targetIds?: string[];
  mode?: "latest" | "comprehensive";
  sources?: string[];
  /**
   * PubMed-only: server-side publication-date window for `esearch` (`pdat`).
   * Omitted → contemporaneous, last 3 years through today (UTC calendar dates, NCBI `YYYY/MM/DD`).
   */
  pubmedPubDate?: {
    mode: "contemporaneous" | "unbounded" | "range";
    /** Contemporaneous only; 1–50, default 3. */
    years?: number;
    /** Range mode: inclusive NCBI-style dates (`YYYY/MM/DD` or `YYYY-MM-DD`). */
    mindate?: string;
    maxdate?: string;
  };
};

export type RunScanPipelineOptions = {
  effectiveSecret: string;
  body: ScanPostBody;
  /** Prefix for server logs on error (e.g. `[POST /api/scan/pubmed]`). */
  logLabel: string;
};

/**
 * Full scan pipeline: Convex run lifecycle, source agents, relevance, digest when applicable.
 * Used by `POST /api/scan` and `POST /api/scan/pubmed`.
 */
export async function runScanPipeline({
  effectiveSecret,
  body,
  logLabel,
}: RunScanPipelineOptions): Promise<NextResponse> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_CONVEX_URL not configured" }, { status: 500 });
  }

  const { scanRunId: bodyScanRunId, period, targetIds, mode, sources: bodySources } = body;
  const scanMode = mode === "comprehensive" ? "comprehensive" : "latest";
  const scanOptions: ScanOptions = {
    mode: scanMode,
    pubmedPubDate: normalizePubmedPubDateInput(body.pubmedPubDate),
  };

  const client = new ConvexHttpClient(convexUrl);
  let scanRunId: Id<"scanRuns"> | undefined;

  try {
    const sourceIdsToRun =
      bodySources?.length &&
      bodySources.every((s) => ALL_SOURCE_IDS.includes(s as (typeof ALL_SOURCE_IDS)[number]))
        ? (bodySources as (typeof ALL_SOURCE_IDS)[number][])
        : undefined;

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
      ? await client.query(api.watchTargets.getByIdsForServer, {
          secret: effectiveSecret,
          ids: targetIds as Id<"watchTargets">[],
        })
      : await client.query(api.watchTargets.listActiveForServer, { secret: effectiveSecret });

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
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      EXA_API_KEY: process.env.EXA_API_KEY,
      PUBMED_API_KEY: process.env.PUBMED_API_KEY,
      PATENTSVIEW_API_KEY: process.env.PATENTSVIEW_API_KEY,
      SEC_EDGAR_USER_AGENT: process.env.SEC_EDGAR_USER_AGENT,
    };

    await client.mutation(api.scans.updateScanStatusFromServer, {
      secret: effectiveSecret,
      scanRunId,
      status: "running",
      startedAt: Date.now(),
    });

    const existingExternalIdsByWatchTarget = await client.query(
      api.rawItems.getExistingExternalIdsByWatchTargetFromServer,
      {
        secret: effectiveSecret,
        sources: sourcesRan,
        watchTargetIds: scanTargets.map((t) => t._id),
      },
    );

    const feedbackForMission = await client.query(api.feedbackForScan.getFeedbackForMission, {
      watchTargetIds: scanTargets.map((t) => t._id),
      limit: 25,
    });

    const sourceResults = await runAllSources(scanTargets, env, {
      ...scanOptions,
      period,
      sources: sourceIdsToRun,
      existingExternalIdsByWatchTarget: existingExternalIdsByWatchTarget as Record<
        string,
        Record<string, string[]>
      >,
      feedbackForMission: feedbackForMission as FeedbackForMission,
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
      const relevantItems =
        source === "edgar"
          ? result.items
          : await filterRelevantItems(result.items, scanTargets, env.GROQ_API_KEY);
      const itemsToUpsert = await enrichMissingSummaries(relevantItems, source, env.GROQ_API_KEY);
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

    const scan = await client.query(api.scans.get, {
      id: scanRunId,
      secret: effectiveSecret,
    });
    if (newFound > 0 || scan?.period === "weekly") {
      const newItems = await client.query(api.rawItems.getNewByScanRunFromServer, {
        secret: effectiveSecret,
        scanRunId,
      });
      const feedbackContext = await client.query(api.digestItems.getFeedbackForPrompt, { limit: 40 });
      const systemDecisionBriefDefault = isDecisionBriefEnabledByDefault(
        process.env.DECISION_DIGEST_ENABLED,
      );
      let shouldGenerateDecisionDigest = systemDecisionBriefDefault;
      if (scan?.digestNotifyUserIds?.length) {
        const prefRows = await client.query(
          api.users.getDecisionBriefPreferencesForUsersFromServer,
          {
            secret: effectiveSecret,
            userIds: scan.digestNotifyUserIds,
          },
        );
        const prefByUserId = new Map(
          prefRows.map((row) => [String(row.userId), row.decisionBriefPreference]),
        );
        shouldGenerateDecisionDigest = scan.digestNotifyUserIds.some((uid) =>
          resolveDecisionBriefEnabled(
            prefByUserId.get(String(uid)),
            systemDecisionBriefDefault,
          ),
        );
      }

      let priorDigestContext: PriorDigestDecisionContext[] | undefined;
      if (env.GROQ_API_KEY && shouldGenerateDecisionDigest) {
        priorDigestContext = await client.query(api.digestRuns.listPriorDecisionContextFromServer, {
          secret: effectiveSecret,
          scanRunId,
          limit: 8,
        });
      }
      const digestTargets: DigestTargetInfo[] = scanTargets.map((t) => ({
        _id: t._id,
        displayName: t.displayName,
        type: t.type,
        therapeuticArea: t.therapeuticArea,
        indication: t.indication,
        notes: t.notes,
      }));
      const payload = env.GROQ_API_KEY
        ? await generateDigestWithAI(
            newItems,
            (scan?.period as "daily" | "weekly") ?? "daily",
            digestTargets,
            env.GROQ_API_KEY,
            feedbackContext,
            priorDigestContext,
            { useDecisionDigest: shouldGenerateDecisionDigest },
          )
        : await generateDigest(
            newItems,
            (scan?.period as "daily" | "weekly") ?? "daily",
            new Map(scanTargets.map((t) => [t._id, t.displayName])),
            env.GROQ_API_KEY,
            feedbackContext
          );
      const rawItemIds = payload.items.flatMap((i) => i.rawItemIds);
      const sourceLinksHash =
        rawItemIds.length > 0
          ? createHash("sha256").update([...rawItemIds].sort().join(",")).digest("hex")
          : undefined;
      const existingReport =
        sourceLinksHash != null
          ? await client.query(api.digestRuns.getBySourceLinksHashFromServer, {
              secret: effectiveSecret,
              sourceLinksHash,
            })
          : null;
      if (!existingReport) {
        const d = payload.decisionDigest;
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
          ...(d
            ? {
                deltaSummary: d.deltaSummary,
                materialitySummary: d.materialitySummary,
                recommendedActionsSummary: d.recommendedActionsSummary,
                ...(d.strategicReadSummary?.trim()
                  ? { strategicReadSummary: d.strategicReadSummary.trim() }
                  : {}),
                confidence: d.confidence,
              }
            : {}),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      scanRunId,
      totalFound,
      newFound,
      failedSources: Object.keys(failedSources).length ? failedSources : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(`${logLabel} error:`, message, stack ?? "");
    if (scanRunId) {
      try {
        await client.mutation(api.scans.markScanRunFailedFromServer, {
          secret: effectiveSecret,
          scanRunId,
          error: message.slice(0, 2000),
        });
      } catch (patchErr) {
        console.error(`${logLabel} markScanRunFailedFromServer:`, patchErr);
      }
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
