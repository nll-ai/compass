import { NextResponse } from "next/server";

export function getScanSecret(): string | undefined {
  return process.env.SCAN_SECRET;
}

/** Same-origin check as `POST /api/scan` (browser fetch from the app). */
export function isSameOriginScanRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if (!origin && !referer) return true;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const allowed = new URL(appUrl).origin;
  if (origin && new URL(origin).origin === allowed) return true;
  if (referer && new URL(referer).origin === allowed) return true;
  if (origin && (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")))
    return true;
  if (referer && (referer.startsWith("http://localhost:") || referer.startsWith("http://127.0.0.1:")))
    return true;
  return false;
}

/**
 * `SCAN_SECRET` must be set. Allow `Authorization: Bearer <SCAN_SECRET>` or same-origin requests.
 */
export function authorizeScanRequest(request: Request):
  | { ok: true; effectiveSecret: string }
  | { ok: false; response: NextResponse } {
  const secret = getScanSecret();
  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json({ error: "SCAN_SECRET not configured" }, { status: 500 }),
    };
  }
  const auth = request.headers.get("Authorization");
  const allowed = auth === `Bearer ${secret}` || isSameOriginScanRequest(request);
  if (!allowed) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true, effectiveSecret: secret };
}
