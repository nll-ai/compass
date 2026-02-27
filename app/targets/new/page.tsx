import Link from "next/link";
import { getAuthSafe } from "@/lib/auth";
import { NewTargetFormSection } from "./NewTargetFormSection";

export default async function NewTargetPage() {
  const { user, signInUrl } = await getAuthSafe();

  return (
    <div className="stack">
      <nav className="muted" style={{ fontSize: "0.9rem" }}>
        <Link href="/targets">Watch Targets</Link>
        <span style={{ margin: "0 0.5rem" }}>/</span>
        Add Watch Target
      </nav>
      <h1 style={{ margin: 0 }}>Add Watch Target</h1>
      <p className="muted" style={{ margin: 0 }}>
        Add a new program or watch target to monitor. We'll look it up and pre-fill the details.
      </p>
      {!user ? (
        <>
          <p className="muted" style={{ color: "var(--error, #b91c1c)" }}>
            You need to sign in to add watch targets.{" "}
            <Link
              href={signInUrl ?? "/sign-in"}
              style={{ color: "var(--link, #2563eb)", fontWeight: 600 }}
            >
              Sign in
            </Link>
          </p>
          <Link href="/targets" className="muted" style={{ fontSize: "0.9rem" }}>
            ← Back to Watch Targets
          </Link>
        </>
      ) : (
        <NewTargetFormSection />
      )}
    </div>
  );
}
