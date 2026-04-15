import { NextResponse } from "next/server";
import type { Id } from "@/convex/_generated/dataModel";
import { backfillDecisionDigestsBatch } from "@/lib/scan/backfillDecisionDigest";
import { authorizeScanRequest } from "@/lib/scan/scanAuth";

/** Allow many sequential Groq calls when batching backfill. */
export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = authorizeScanRequest(req);
  if (!auth.ok) return auth.response;

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey) {
    return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_CONVEX_URL not configured" }, { status: 500 });
  }

  let body: { limit?: number; digestRunId?: string; force?: boolean } = {};
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json") && req.body) {
      body = (await req.json()) as typeof body;
    }
  } catch {
    body = {};
  }

  const limit =
    typeof body.limit === "number" && Number.isFinite(body.limit) && body.limit > 0
      ? Math.min(Math.floor(body.limit), 500)
      : 50;
  const digestRunIdRaw =
    typeof body.digestRunId === "string" && body.digestRunId.trim() ? body.digestRunId.trim() : undefined;
  const force = body.force === true;

  try {
    const { results, summary } = await backfillDecisionDigestsBatch({
      convexUrl,
      secret: auth.effectiveSecret,
      groqApiKey: groqKey,
      limit,
      digestRunId: digestRunIdRaw as Id<"digestRuns"> | undefined,
      force,
    });
    return NextResponse.json({ ok: true, summary, results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Backfill failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
