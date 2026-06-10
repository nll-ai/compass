import { NextResponse } from "next/server";

export function getScanSecret(): string | undefined {
  return process.env.SCAN_SECRET;
}

/** Same-origin check as `POST /api/scan` (browser fetch from the app). */
export function isSameOriginScanRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if (!origin && !referer) return true;
  const allowed = getAllowedScanOrigins(request);
  if (origin && allowed.has(new URL(origin).origin)) return true;
  if (referer && allowed.has(new URL(referer).origin)) return true;
  return false;
}

function getAllowedScanOrigins(request: Request): Set<string> {
  const origins = new Set<string>();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  origins.add(new URL(appUrl).origin);
  origins.add("http://localhost:3000");
  const host = request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    origins.add(`${proto}://${host}`);
  }
  return origins;
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
