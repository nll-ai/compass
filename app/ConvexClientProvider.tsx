"use client";

import {
  ConvexProviderWithAuth,
  ConvexReactClient,
  useConvexAuth,
} from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function useConvexTokenAuth() {
  const [tokenResult, setTokenResult] = useState<{
    token: string | null;
    fetched: boolean;
  }>({ token: null, fetched: false });

  const fetchAccessToken = useCallback(
    async ({
      forceRefreshToken,
    }: {
      forceRefreshToken: boolean;
    }): Promise<string | null> => {
      try {
        const res = await fetch("/api/convex-token", {
          cache: "no-store",
          credentials: "include",
        });
        const data = (await res.json()) as { token?: string | null };
        const token = data.token ?? null;
        setTokenResult({ token, fetched: true });
        return token;
      } catch {
        setTokenResult({ token: null, fetched: true });
        return null;
      }
    },
    [],
  );

  useEffect(() => {
    void fetchAccessToken({ forceRefreshToken: false });
  }, [fetchAccessToken]);

  return useMemo(
    () => ({
      isLoading: !tokenResult.fetched,
      isAuthenticated: tokenResult.fetched && tokenResult.token !== null,
      fetchAccessToken,
    }),
    [tokenResult.fetched, tokenResult.token, fetchAccessToken],
  );
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useConvexTokenAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}

export { useConvexAuth };
