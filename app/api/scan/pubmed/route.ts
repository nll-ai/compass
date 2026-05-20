import { NextResponse } from "next/server";
import { runScanPipeline, type ScanPostBody } from "../../../../lib/scan/runScanPipeline";
import { authorizeScanRequest } from "../../../../lib/scan/scanAuth";

/** PubMed-only scan for one watch target (same pipeline as `POST /api/scan` with `sources: ["pubmed"]`). */
export const maxDuration = 300;

type PubmedScanBody = {
  watchTargetId: string;
  /** Defaults to `daily`. */
  period?: "daily" | "weekly";
  /** Defaults to `comprehensive` (matches UI “Run scan”). */
  mode?: "latest" | "comprehensive";
  /** See `ScanPostBody.pubmedPubDate` (LLD §4.2.1). */
  pubmedPubDate?: ScanPostBody["pubmedPubDate"];
  /**
   * Recency window (calendar days). **0** = no limit. Omitted → **14** in shared pipeline.
   * When `pubmedPubDate` is set, it wins for PubMed `esearch`; lookback still applies to digest / filtering.
   */
  lookbackDays?: number;
};

export async function POST(request: Request) {
  const auth = authorizeScanRequest(request);
  if (!auth.ok) return auth.response;

  let raw: PubmedScanBody;
  try {
    raw = (await request.json()) as PubmedScanBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const watchTargetId = typeof raw.watchTargetId === "string" ? raw.watchTargetId.trim() : "";
  if (!watchTargetId) {
    return NextResponse.json({ error: "watchTargetId is required" }, { status: 400 });
  }

  const period = raw.period ?? "daily";
  if (period !== "daily" && period !== "weekly") {
    return NextResponse.json({ error: "period must be daily | weekly" }, { status: 400 });
  }

  const mode = raw.mode ?? "comprehensive";

  if (raw.lookbackDays !== undefined) {
    if (typeof raw.lookbackDays !== "number" || !Number.isFinite(raw.lookbackDays)) {
      return NextResponse.json({ error: "lookbackDays must be a finite number" }, { status: 400 });
    }
    if (raw.lookbackDays < 0 || raw.lookbackDays > 365) {
      return NextResponse.json({ error: "lookbackDays must be from 0 to 365" }, { status: 400 });
    }
  }

  if (raw.pubmedPubDate != null) {
    if (typeof raw.pubmedPubDate !== "object" || raw.pubmedPubDate === null) {
      return NextResponse.json({ error: "pubmedPubDate must be an object" }, { status: 400 });
    }
    const pdMode = raw.pubmedPubDate.mode;
    if (pdMode !== "contemporaneous" && pdMode !== "unbounded" && pdMode !== "range") {
      return NextResponse.json(
        { error: "pubmedPubDate.mode must be contemporaneous | unbounded | range" },
        { status: 400 }
      );
    }
    const years = raw.pubmedPubDate.years;
    if (years !== undefined && (typeof years !== "number" || years < 1 || years > 50)) {
      return NextResponse.json({ error: "pubmedPubDate.years must be a number from 1 to 50" }, { status: 400 });
    }
    if (pdMode === "range") {
      const mindate = raw.pubmedPubDate.mindate;
      const maxdate = raw.pubmedPubDate.maxdate;
      if (typeof mindate !== "string" || !mindate.trim() || typeof maxdate !== "string" || !maxdate.trim()) {
        return NextResponse.json(
          { error: "pubmedPubDate.range requires non-empty mindate and maxdate strings" },
          { status: 400 }
        );
      }
    }
  }

  return runScanPipeline({
    effectiveSecret: auth.effectiveSecret,
    body: {
      period,
      targetIds: [watchTargetId],
      mode,
      sources: ["pubmed"],
      ...(raw.pubmedPubDate != null ? { pubmedPubDate: raw.pubmedPubDate } : {}),
      ...(raw.lookbackDays !== undefined ? { lookbackDays: raw.lookbackDays } : {}),
    },
    logLabel: "[POST /api/scan/pubmed]",
  });
}
