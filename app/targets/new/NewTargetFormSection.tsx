"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AddTargetForm } from "@/components/compass/AddTargetForm";

export function NewTargetFormSection() {
  const router = useRouter();

  return (
    <>
      <AddTargetForm onAdded={() => router.push("/targets")} />
      <Link href="/targets" className="muted" style={{ fontSize: "0.9rem" }}>
        ← Back to Watch Targets
      </Link>
    </>
  );
}
