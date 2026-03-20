"use client";

import { useConvexAuth } from "convex/react";

/**
 * Convex `useQuery(..., "skip")` should be used while the Convex client is still
 * validating the JWT or when there is no valid session. Otherwise public queries
 * can stay `undefined` indefinitely instead of resolving.
 */
export function useConvexAuthQuerySkip(): boolean {
  const { isLoading, isAuthenticated } = useConvexAuth();
  return isLoading || !isAuthenticated;
}
