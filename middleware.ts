import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

export default authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: [
      "/",
      "/sign-in",
      "/callback",
      "/sw.js",
      "/api/convex-token",
      "/api/scan",
      "/api/scan/pubmed",
      "/api/digest/backfill-decision",
      // LLM smoke routes (Groq); same pattern as /api/scan — not gated by WorkOS session
      "/api/schedule/parse",
      "/api/targets/lookup",
      "/api/fetch-page",
      "/_next/static/:path*",
      "/_next/image",
      "/favicon.ico",
    ],
  },
});

export const config = {
  // Run on all routes (required for withAuth in root layout)
  matcher: ["/:path*"],
};
