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
