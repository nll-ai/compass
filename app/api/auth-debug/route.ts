import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { cookies } from "next/headers";
import { isEmailAllowed } from "@/lib/auth-allowlist";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const allCookieNames = cookieStore.getAll().map((c) => c.name);

  const hasPrivateKey = Boolean(process.env.CONVEX_JWT_PRIVATE_KEY);
  const hasWorkosClientId = Boolean(process.env.WORKOS_CLIENT_ID);
  const hasWorkosCookiePassword = Boolean(process.env.WORKOS_COOKIE_PASSWORD);
  const hasWorkosApiKey = Boolean(process.env.WORKOS_API_KEY);
  const redirectUri = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ?? "(not set)";
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? "(not set)";

  let authkitUser: Record<string, unknown> | null = null;
  let authkitError: string | null = null;
  try {
    const { authkit } = await import("@workos-inc/authkit-nextjs");
    const { session } = await authkit(request);
    if (session?.user) {
      authkitUser = { id: session.user.id, email: session.user.email };
    }
  } catch (e) {
    authkitError = e instanceof Error ? e.message : String(e);
  }

  const emailAllowed = authkitUser?.email
    ? isEmailAllowed(authkitUser.email as string)
    : null;

  let tokenResult: string | null = null;
  let tokenError: string | null = null;
  let tokenPreview: string | null = null;
  if (authkitUser && emailAllowed && hasPrivateKey) {
    try {
      const { importPKCS8 } = await import("jose");
      const pem = process.env.CONVEX_JWT_PRIVATE_KEY!;
      const privateKey = await importPKCS8(
        pem.replace(/\\n/g, "\n").trim(),
        "RS256",
      );
      const now = Math.floor(Date.now() / 1000);
      const token = await new SignJWT({
        profile: { email: authkitUser.email },
      })
        .setProtectedHeader({
          alg: "RS256",
          typ: "JWT",
          kid: "compass-1772162961019",
        })
        .setSubject(authkitUser.id as string)
        .setIssuer("https://compass-five-silk.vercel.app")
        .setAudience("compass-convex")
        .setIssuedAt(now)
        .setExpirationTime(now + 600)
        .sign(privateKey);
      tokenResult = "ok";
      tokenPreview = token.slice(0, 20) + "..." + token.slice(-20);
    } catch (e) {
      tokenError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json(
    {
      cookies: allCookieNames,
      env: {
        hasPrivateKey,
        hasWorkosClientId,
        hasWorkosCookiePassword,
        hasWorkosApiKey,
        redirectUri,
        convexUrl,
      },
      authkit: authkitUser
        ? { user: authkitUser }
        : { error: authkitError ?? "no_user" },
      emailAllowed,
      jwtSign: tokenResult
        ? { result: tokenResult, preview: tokenPreview }
        : { error: tokenError ?? "skipped" },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
