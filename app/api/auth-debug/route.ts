import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const allCookieNames = cookieStore.getAll().map((c) => c.name);
  const hasWosSession = allCookieNames.some((n) => n.includes("wos") || n.includes("session"));

  const hasPrivateKey = Boolean(process.env.CONVEX_JWT_PRIVATE_KEY);
  const hasWorkosClientId = Boolean(process.env.WORKOS_CLIENT_ID);
  const hasWorkosCookiePassword = Boolean(process.env.WORKOS_COOKIE_PASSWORD);
  const hasWorkosApiKey = Boolean(process.env.WORKOS_API_KEY);
  const redirectUri = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ?? "(not set)";

  let authkitResult: string;
  let authkitUser: string | null = null;
  try {
    const { authkit } = await import("@workos-inc/authkit-nextjs");
    const { session } = await authkit(request);
    authkitUser = session?.user?.email ?? session?.user?.id ?? null;
    authkitResult = authkitUser ? "ok" : "no_user";
  } catch (e) {
    authkitResult = `error: ${e instanceof Error ? e.message : String(e)}`;
  }

  let withAuthResult: string;
  let withAuthUser: string | null = null;
  try {
    const { withAuth } = await import("@workos-inc/authkit-nextjs");
    const { user } = await withAuth();
    withAuthUser = user?.email ?? user?.id ?? null;
    withAuthResult = withAuthUser ? "ok" : "no_user";
  } catch (e) {
    withAuthResult = `error: ${e instanceof Error ? e.message : String(e)}`;
  }

  return NextResponse.json({
    cookies: allCookieNames,
    hasWosSession,
    env: {
      hasPrivateKey,
      hasWorkosClientId,
      hasWorkosCookiePassword,
      hasWorkosApiKey,
      redirectUri,
    },
    authkit: { result: authkitResult, user: authkitUser },
    withAuth: { result: withAuthResult, user: withAuthUser },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
