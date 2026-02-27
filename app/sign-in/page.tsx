import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  if (params?.error === "not-allowed") {
    return (
      <div className="stack" style={{ gap: "1rem", maxWidth: "28rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700 }}>
          Access restricted
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          Only @ormoni.bio addresses and approved users can sign in to Compass.
        </p>
        <Link href="/sign-in" style={{ fontWeight: 600 }}>
          Try again
        </Link>
      </div>
    );
  }
  const signInUrl = await getSignInUrl();
  redirect(signInUrl);
}
