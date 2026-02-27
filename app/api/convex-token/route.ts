import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { isEmailAllowed } from "@/lib/auth-allowlist";

// Must match convex/auth.config.ts issuer exactly (Convex rejects otherwise)
const ISSUER = "https://compass-five-silk.vercel.app";
const AUDIENCE = "compass-convex";
const KID = "compass-1772162961019";
const EXPIRY_SEC = 10 * 60; // 10 minutes

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const { user } = await withAuth();
    if (!user) {
      return NextResponse.json(
        { token: null, error: "not_signed_in" },
        { status: 401, headers: NO_STORE },
      );
    }
    if (!isEmailAllowed(user.email)) {
      return NextResponse.json(
        { token: null, error: "email_not_allowed" },
        { status: 401, headers: NO_STORE },
      );
    }
    const privateKeyPem = process.env.CONVEX_JWT_PRIVATE_KEY;
    if (!privateKeyPem) {
      console.error("CONVEX_JWT_PRIVATE_KEY is not set");
      return NextResponse.json(
        { error: "Server auth not configured" },
        { status: 500, headers: NO_STORE },
      );
    }
    const { importPKCS8 } = await import("jose");
    const privateKey = await importPKCS8(
      privateKeyPem.replace(/\\n/g, "\n").trim(),
      "RS256",
    );
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      profile: {
        email: user.email ?? "",
        firstName: user.firstName ?? undefined,
        lastName: user.lastName ?? undefined,
      },
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: KID })
      .setSubject(user.id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + EXPIRY_SEC)
      .sign(privateKey);
    return NextResponse.json({ token }, { headers: NO_STORE });
  } catch (e) {
    console.error("Convex token error:", e);
    return NextResponse.json(
      { token: null, error: "token_error" },
      { status: 401, headers: NO_STORE },
    );
  }
}
