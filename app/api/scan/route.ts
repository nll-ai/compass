import { NextResponse } from "next/server";
import type { ScanPostBody } from "../../../lib/scan/runScanPipeline";
import { runScanPipeline } from "../../../lib/scan/runScanPipeline";
import { authorizeScanRequest } from "../../../lib/scan/scanAuth";

/** Allow long comprehensive runs (Vercel Pro supports up to 300s per route). */
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = authorizeScanRequest(request);
  if (!auth.ok) return auth.response;

  let body: ScanPostBody;
  try {
    body = (await request.json()) as ScanPostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { period } = body;
  if (!period || (period !== "daily" && period !== "weekly")) {
    return NextResponse.json({ error: "period required: daily | weekly" }, { status: 400 });
  }

  return runScanPipeline({
    effectiveSecret: auth.effectiveSecret,
    body,
    logLabel: "[POST /api/scan]",
  });
}
