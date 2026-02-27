import { getSignInUrl, withAuth } from "@workos-inc/authkit-nextjs";

const MIDDLEWARE_ERROR =
  "isn't covered by the AuthKit middleware";

/**
 * Safe auth helper for use in layouts and pages that may be rendered
 * on requests that bypass the AuthKit middleware (e.g. RSC prefetch, /sw.js).
 * Returns { user: null, signInUrl } when middleware hasn't run, so the UI
 * can still render instead of throwing.
 */
export async function getAuthSafe(): Promise<{
  user: { id: string; email?: string | null; firstName?: string | null; lastName?: string | null } | null;
  signInUrl: string | null;
}> {
  try {
    const { user } = await withAuth();
    const signInUrl = user ? null : await getSignInUrl();
    return { user, signInUrl };
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes(MIDDLEWARE_ERROR)
    ) {
      const signInUrl = await getSignInUrl();
      return { user: null, signInUrl };
    }
    throw err;
  }
}
