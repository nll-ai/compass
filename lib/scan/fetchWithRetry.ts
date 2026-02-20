/**
 * Fetch with retries on 429/503 (and optional 5xx).
 * Uses Retry-After header when present, otherwise exponential backoff.
 * Callers should still handle non-2xx and set result.error for the source.
 */

const DEFAULT_RETRIES_429_503 = 3;
const DEFAULT_RETRIES_5XX = 1;
const INITIAL_BACKOFF_MS = 2000;

function parseRetryAfter(value: string | null): number | null {
  if (!value?.trim()) return null;
  const n = parseInt(value.trim(), 10);
  if (Number.isFinite(n)) {
    if (n <= 60) return n * 1000;
    return 60 * 1000;
  }
  return null;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FetchWithRetryOptions {
  /** Retries on 429/503. Default 3. */
  retries429503?: number;
  /** Retries on 5xx. Default 1. */
  retries5xx?: number;
  /** Optional delay in ms before the first request (throttling). */
  throttleMs?: number;
}

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: FetchWithRetryOptions
): Promise<Response> {
  const retries429503 = options?.retries429503 ?? DEFAULT_RETRIES_429_503;
  const retries5xx = options?.retries5xx ?? DEFAULT_RETRIES_5XX;
  const throttleMs = options?.throttleMs ?? 0;

  if (throttleMs > 0) {
    await sleep(throttleMs);
  }

  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= Math.max(retries429503, retries5xx); attempt++) {
    lastResponse = await fetch(url, init);
    lastError = null;

    if (lastResponse.ok) {
      return lastResponse;
    }

    const status = lastResponse.status;
    const is429or503 = status === 429 || status === 503;
    const is5xx = status >= 500 && status < 600;

    const useRetry429 =
      is429or503 && attempt < retries429503;
    const useRetry5xx =
      is5xx && !is429or503 && attempt < retries5xx;

    if (!useRetry429 && !useRetry5xx) {
      return lastResponse;
    }

    const retryAfter = parseRetryAfter(lastResponse.headers.get("Retry-After"));
    const backoffMs =
      retryAfter ??
      INITIAL_BACKOFF_MS * Math.pow(2, attempt);

    await sleep(backoffMs);
  }

  return lastResponse!;
}
