import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  generateDecisionDigestSectionsForBackfill,
  type DigestTargetInfo,
  type NewRawItem,
} from "./digest";

/** Map opaque Convex client errors to actionable text (see `npm run convex:logs -- --history 50`). */
export function interpretConvexBackfillError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (
    /Could not find public function/i.test(msg) ||
    /forget to run `npx convex dev`/i.test(msg) ||
    /Did you forget to run `npx convex dev`/i.test(msg)
  ) {
    return "convex_not_synced: This deployment does not have the backfill API yet. In another terminal run `npx convex dev` (or `npx convex deploy`) from the repo root, wait until functions push, then try again.";
  }
  if (/Server Error/i.test(msg) && /Request ID/i.test(msg)) {
    return `${msg.trim()} — For details: npm run convex:logs -- --history 100`;
  }
  return msg.trim() || "Unknown error";
}

function digestRunHasStoredDecision(run: {
  deltaSummary?: string;
  materialitySummary?: string;
  recommendedActionsSummary?: string;
  strategicReadSummary?: string;
  confidence?: string | undefined;
}): boolean {
  return (
    (run.deltaSummary?.trim() ?? "") !== "" ||
    (run.materialitySummary?.trim() ?? "") !== "" ||
    (run.recommendedActionsSummary?.trim() ?? "") !== "" ||
    (run.strategicReadSummary?.trim() ?? "") !== "" ||
    run.confidence != null
  );
}

export type BackfillDecisionDigestOneResult = {
  ok: boolean;
  digestRunId: string;
  skipped?: string;
  error?: string;
};

export async function backfillOneDigestRun(options: {
  client: ConvexHttpClient;
  secret: string;
  groqApiKey: string;
  digestRunId: Id<"digestRuns">;
  force?: boolean;
}): Promise<BackfillDecisionDigestOneResult> {
  const { client, secret, groqApiKey, digestRunId, force } = options;

  try {
    const run = await client.query(api.digestRuns.getDigestRunByIdForServer, {
      secret,
      id: digestRunId as string,
    });
    if (!run) return { ok: false, digestRunId, error: "digest_run_not_found" };

    if (!force && digestRunHasStoredDecision(run)) {
      return { ok: true, digestRunId, skipped: "already_has_decision" };
    }

    const items = await client.query(api.digestItems.listByDigestRunFromServer, {
      secret,
      digestRunId,
    });
    if (items.length === 0) {
      return { ok: true, digestRunId, skipped: "no_digest_items" };
    }

    const rawIdSet = new Set<string>();
    for (const it of items) {
      for (const rid of it.rawItemIds) rawIdSet.add(rid as string);
    }
    const rawIds = [...rawIdSet] as Id<"rawItems">[];
    if (rawIds.length === 0) {
      return { ok: true, digestRunId, skipped: "no_raw_item_ids" };
    }

    const rawRows = await client.query(api.rawItems.getByIdsForServer, {
      secret,
      ids: rawIds,
    });
    if (rawRows.length === 0) {
      return { ok: false, digestRunId, error: "raw_items_not_found" };
    }

    const newItems: NewRawItem[] = rawRows.map((doc) => ({
      _id: doc._id,
      watchTargetId: doc.watchTargetId,
      title: doc.title,
      url: doc.url,
      source: doc.source,
      abstract: doc.abstract,
      fullText: doc.fullText,
      publishedAt: doc.publishedAt,
      metadata: doc.metadata as Record<string, unknown> | null | undefined,
    }));

    const scan = await client.query(api.scans.get, {
      id: run.scanRunId,
      secret,
    });
    if (!scan?.targetIds?.length) {
      return { ok: false, digestRunId, error: "scan_run_missing_targets" };
    }

    const priorDigestContext = await client.query(api.digestRuns.listPriorDecisionContextFromServer, {
      secret,
      digestRunId,
      limit: 8,
    });

    const targets = await client.query(api.watchTargets.getByIdsForServer, {
      secret,
      ids: scan.targetIds,
    });
    const digestTargets: DigestTargetInfo[] = targets.map((t) => ({
      _id: t._id,
      displayName: t.displayName,
      type: t.type,
      therapeuticArea: t.therapeuticArea,
      indication: t.indication,
      notes: t.notes,
    }));

    const decision = await generateDecisionDigestSectionsForBackfill(
      newItems,
      digestTargets,
      groqApiKey,
      { executiveSummary: run.executiveSummary, priorDigestContext },
    );
    if (!decision.ok) {
      const err =
        decision.reason === "llm_error" && decision.detail
          ? /forbidden/i.test(decision.detail)
            ? "llm_error_forbidden: Groq rejected this request (API key/model access). Verify GROQ_API_KEY and model access in your Groq project."
            : `llm_error: ${decision.detail}`
          : decision.reason === "empty_sections"
            ? "llm_empty_sections: Model returned only empty text for decision sections (check GROQ_MODEL_SMART / prompt or retry)."
            : decision.reason;
      return { ok: false, digestRunId, error: err };
    }

    await client.mutation(api.digests.patchDecisionDigestFromServer, {
      secret,
      digestRunId,
      deltaSummary: decision.sections.deltaSummary,
      materialitySummary: decision.sections.materialitySummary,
      recommendedActionsSummary: decision.sections.recommendedActionsSummary,
      ...(decision.sections.strategicReadSummary?.trim()
        ? { strategicReadSummary: decision.sections.strategicReadSummary.trim() }
        : {}),
      confidence: decision.sections.confidence,
    });

    return { ok: true, digestRunId };
  } catch (e) {
    return { ok: false, digestRunId, error: interpretConvexBackfillError(e) };
  }
}

export async function backfillDecisionDigestsBatch(options: {
  convexUrl: string;
  secret: string;
  groqApiKey: string;
  limit?: number;
  digestRunId?: Id<"digestRuns">;
  /** When true, process newest `limit` runs (re-generate decision brief even if present). */
  force?: boolean;
}): Promise<{
  results: BackfillDecisionDigestOneResult[];
  summary: { updated: number; skipped: number; failed: number };
}> {
  const { convexUrl, secret, groqApiKey, limit = 50, digestRunId, force } = options;
  const client = new ConvexHttpClient(convexUrl);

  let ids: Id<"digestRuns">[];
  try {
    if (digestRunId) {
      ids = [digestRunId];
    } else if (force) {
      ids = await client.query(api.digestRuns.listDigestRunIdsNewestFromServer, {
        secret,
        limit,
      });
    } else {
      ids = await client.query(api.digestRuns.listDigestRunIdsMissingDecisionFromServer, {
        secret,
        limit,
      });
    }
  } catch (e) {
    const syntheticId = (digestRunId ?? "batch") as Id<"digestRuns">;
    return {
      results: [
        {
          ok: false,
          digestRunId: syntheticId,
          error: interpretConvexBackfillError(e),
        },
      ],
      summary: { updated: 0, skipped: 0, failed: 1 },
    };
  }

  const results: BackfillDecisionDigestOneResult[] = [];
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const id of ids) {
    const r = await backfillOneDigestRun({ client, secret, groqApiKey, digestRunId: id, force });
    results.push(r);
    if (!r.ok) failed++;
    else if (r.skipped) skipped++;
    else updated++;
  }

  return { results, summary: { updated, skipped, failed } };
}
