"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConvexAuth } from "@/app/ConvexClientProvider";
import { AddTargetForm } from "@/components/compass/AddTargetForm";

export default function NewTargetPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();

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
      {isLoading ? (
        <p className="muted">Checking sign-in…</p>
      ) : !isAuthenticated ? (
        <>
          <p className="muted" style={{ color: "var(--error, #b91c1c)" }}>
            You need to sign in to add watch targets.{" "}
            <Link href="/sign-in" style={{ color: "var(--link, #2563eb)", fontWeight: 600 }}>
              Sign in
            </Link>
          </p>
          <Link href="/targets" className="muted" style={{ fontSize: "0.9rem" }}>
            ← Back to Watch Targets
          </Link>
        </>
      ) : (
        <>
          <AddTargetForm onAdded={() => router.push("/targets")} />
          <Link href="/targets" className="muted" style={{ fontSize: "0.9rem" }}>
            ← Back to Watch Targets
          </Link>
        </>
      )}
    </div>
  );
}
