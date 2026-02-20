"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { WatchTargetCard } from "@/components/compass/WatchTargetCard";

export default function TargetsPage() {
  const targets = useQuery(api.watchTargets.listAll);

  if (targets === undefined) {
    return (
      <div className="stack">
        <h1>Watch Targets</h1>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <h1>Watch Targets</h1>
      <p className="muted">Programs and biological targets you're monitoring.</p>
      <Link
        href="/targets/new"
        className="card muted"
        style={{ display: "inline-block", padding: "0.5rem 1rem" }}
      >
        + Add Watch Target
      </Link>
      {targets.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No watch targets yet. <Link href="/targets/new">Add your first watch target</Link>.
          </p>
        </div>
      ) : (
        <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "1rem" }}>
          {targets.map((t) => (
            <li key={t._id}>
              <Link href={`/targets/${t._id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <WatchTargetCard
                  target={{
                    _id: t._id,
                    name: t.name,
                    displayName: t.displayName,
                    type: t.type,
                    aliases: t.aliases,
                    indication: t.indication,
                    company: t.company,
                    therapeuticArea: t.therapeuticArea,
                    active: t.active,
                    notes: t.notes,
                  }}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
