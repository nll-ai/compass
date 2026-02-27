import { NextRequest, NextResponse } from "next/server";
import { SignJWT, importPKCS8 } from "jose";
import { cookies } from "next/headers";
import { isEmailAllowed } from "@/lib/auth-allowlist";

function normalizePem(raw: string): string {
  let pem = raw
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "")
    .trim();
  if (!pem.includes("\n")) {
    pem = pem
      .replace("-----BEGIN PRIVATE KEY-----", "-----BEGIN PRIVATE KEY-----\n")
      .replace("-----END PRIVATE KEY-----", "\n-----END PRIVATE KEY-----")
      .replace(
        "-----BEGIN RSA PRIVATE KEY-----",
        "-----BEGIN RSA PRIVATE KEY-----\n",
      )
      .replace(
        "-----END RSA PRIVATE KEY-----",
        "\n-----END RSA PRIVATE KEY-----",
      );
    const match = pem.match(
      /(-----BEGIN (?:RSA )?PRIVATE KEY-----)\n(.+)\n(-----END (?:RSA )?PRIVATE KEY-----)/,
    );
    if (match) {
      const body = match[2].replace(/\s+/g, "");
      const lines = body.match(/.{1,64}/g) ?? [body];
      pem = `${match[1]}\n${lines.join("\n")}\n${match[3]}`;
    }
  }
  return pem;
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const allCookieNames = cookieStore.getAll().map((c) => c.name);

  const rawKey = process.env.CONVEX_JWT_PRIVATE_KEY ?? "";
  const keyInfo = {
    length: rawKey.length,
    startsWithDash: rawKey.startsWith("-----"),
    hasLiteralBackslashN: rawKey.includes("\\n"),
    hasRealNewline: rawKey.includes("\n"),
    first30: rawKey.slice(0, 30),
    last20: rawKey.slice(-20),
  };

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
  let normalizedKeyPreview: string | null = null;
  if (authkitUser && emailAllowed && rawKey) {
    try {
      const pem = normalizePem(rawKey);
      normalizedKeyPreview = pem.slice(0, 40) + "...";
      const privateKey = await importPKCS8(pem, "RS256");
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
      authkit: authkitUser
        ? { user: authkitUser }
        : { error: authkitError ?? "no_user" },
      emailAllowed,
      keyInfo,
      normalizedKeyPreview,
      jwtSign: tokenResult
        ? { result: tokenResult, preview: tokenPreview }
        : { error: tokenError ?? "skipped" },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
