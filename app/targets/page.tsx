"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { WatchTargetCard } from "@/components/compass/WatchTargetCard";
import { formatDate } from "@/lib/formatters";

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export default function TargetsPage() {
  const targets = useQuery(api.watchTargets.listAll);
  const runningScans = useQuery(api.scans.listRunning);

  if (targets === undefined) {
    return (
      <div className="stack">
        <h1>Watch Targets</h1>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const targetById = new Map(targets?.map((t) => [t._id, t]) ?? []);

  return (
    <div className="stack">
      <h1>Watch Targets</h1>
      <p className="muted">Programs and biological targets you're monitoring.</p>

      {runningScans !== undefined && runningScans.length > 0 && (
        <section className="card stack" style={{ gap: "0.75rem" }} aria-label="Running scans">
          <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Running scans</h2>
          <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
            Scans currently pending or in progress. This list updates automatically.
          </p>
          <ul className="running-scan-list stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: "0.5rem" }}>
            {runningScans.map((run) => {
              const targetNames =
                run.targetIds
                  ?.map((id) => targetById.get(id)?.displayName)
                  .filter(Boolean)
                  .join(", ") ?? "—";
              const time =
                run.status === "running" && run.startedAt != null
                  ? `Started ${formatDate(run.startedAt)} ${formatTime(run.startedAt)}`
                  : `Scheduled ${formatDate(run.scheduledFor)} ${formatTime(run.scheduledFor)}`;
              const progress = `${run.sourcesCompleted ?? 0}/${run.sourcesTotal} sources`;
              return (
                <li
                  key={run._id}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "0.5rem 1rem",
                    padding: "0.5rem 0",
                    borderBottom: "1px solid var(--border, #e5e7eb)",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color: run.status === "running" ? "var(--link, #2563eb)" : "var(--muted, #6b7280)",
                    }}
                  >
                    {run.status === "running" ? "Running" : "Pending"}
                  </span>
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    {time}
                  </span>
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    {targetNames}
                  </span>
                  <span className="muted" style={{ fontSize: "0.85rem", marginLeft: "auto" }}>
                    {progress}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
