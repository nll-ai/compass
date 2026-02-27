import { SignJWT, importPKCS8 } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { authkit } from "@workos-inc/authkit-nextjs";
import { isEmailAllowed } from "@/lib/auth-allowlist";

// Must match convex/auth.config.ts issuer exactly (Convex rejects otherwise)
const ISSUER = "https://compass-five-silk.vercel.app";
const AUDIENCE = "compass-convex";
const KID = "compass-1772162961019";
const EXPIRY_SEC = 10 * 60; // 10 minutes

const NO_STORE = { "Cache-Control": "private, no-store" };

/** Normalize a PEM string that may have literal \n, escaped newlines, or be a single line. */
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
  try {
    const { session } = await authkit(request);
    const user = session?.user ?? null;
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
    const pem = normalizePem(privateKeyPem);
    const privateKey = await importPKCS8(pem, "RS256");
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
