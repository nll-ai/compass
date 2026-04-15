/**
 * Client-side hooks for digest engagement. Extend with analytics when needed.
 * When `NEXT_PUBLIC_DIGEST_TELEMETRY` is `"1"`, logs structured events to the console in development.
 */

export type DigestViewPayload = {
  digestRunId: string;
  hasDecisionBrief: boolean;
};

export function trackDigestDetailViewed(payload: DigestViewPayload): void {
  if (typeof window === "undefined") return;
  if (process.env.NEXT_PUBLIC_DIGEST_TELEMETRY !== "1") return;
  // eslint-disable-next-line no-console -- intentional dev telemetry
  console.debug("[compass:telemetry] digest_detail_viewed", payload);
}
