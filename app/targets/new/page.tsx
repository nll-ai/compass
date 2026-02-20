"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AddTargetForm } from "@/components/compass/AddTargetForm";

export default function NewTargetPage() {
  const router = useRouter();

  return (
    <div className="stack">
      <nav className="muted" style={{ fontSize: "0.9rem" }}>
        <Link href="/targets">Targets</Link>
        <span style={{ margin: "0 0.5rem" }}>/</span>
        Add target
      </nav>
      <h1 style={{ margin: 0 }}>Add target</h1>
      <p className="muted" style={{ margin: 0 }}>
        Add a new program or target to monitor. We'll look it up and pre-fill the details.
      </p>
      <AddTargetForm onAdded={() => router.push("/targets")} />
      <Link href="/targets" className="muted" style={{ fontSize: "0.9rem" }}>
        ← Back to targets
      </Link>
    </div>
  );
}
