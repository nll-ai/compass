"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatDate, executiveSummarySnippet } from "@/lib/formatters";
import { useState } from "react";

export default function TargetDigestsPage() {
  const params = useParams();
  const id = params.id as Id<"watchTargets">;
  const target = useQuery(api.watchTargets.get, { id });
  const runs = useQuery(api.digestRuns.listSignalReportsForTarget, { watchTargetId: id, limit: 50 });
  const removeRun = useMutation(api.digestRuns.remove);
  const [deletingId, setDeletingId] = useState<Id<"digestRuns"> | null>(null);

  if (target === undefined || runs === undefined) {
    return (
      <div className="stack">
        <h1>Digest log</h1>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (target === null) {
    return (
      <div className="stack">
        <h1>Watch target not found</h1>
        <p className="muted">This watch target may have been removed.</p>
        <Link href="/targets">← Back to Watch Targets</Link>
      </div>
    );
  }

  return (
    <div className="stack">
      <nav className="muted" style={{ fontSize: "0.9rem" }}>
        <Link href="/targets">Watch Targets</Link>
        <span style={{ margin: "0 0.5rem" }}>/</span>
        <Link href={`/targets/${id}`}>{target.displayName}</Link>
        <span style={{ margin: "0 0.5rem" }}>/</span>
        Digest log
      </nav>
      <h1 style={{ margin: 0 }}>Digest log</h1>
      <p className="muted" style={{ margin: 0 }}>
        AI-generated digests that include {target.displayName}. A new digest is created only when source links change.
      </p>
      {target.notes?.trim() ? (
        <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.9rem" }}>
          Your goal: {target.notes.trim()}
        </p>
      ) : null}
      {runs.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No digests yet for this target. Run a scan to generate one.
          </p>
        </div>
      ) : (
        <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {runs.map((run) => (
            <li key={run._id}>
              <div
                className="card"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                }}
              >
                <Link
                  href={`/digest/${run._id}`}
                  style={{
                    flex: "1 1 0",
                    minWidth: 0,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{formatDate(run.generatedAt)}</span>
                  <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.9rem", lineHeight: 1.4 }}>
                    {executiveSummarySnippet(run.executiveSummary)}
                  </p>
                  <span className="muted" style={{ marginTop: "0.5rem", display: "inline-block", fontSize: "0.85rem" }}>
                    {run.totalSignals} signal{run.totalSignals !== 1 ? "s" : ""} · View full digest →
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={async (e) => {
                    e.preventDefault();
                    if (deletingId === run._id) return;
                    setDeletingId(run._id);
                    try {
                      await removeRun({ id: run._id });
                    } finally {
                      setDeletingId(null);
                    }
                  }}
                  disabled={deletingId === run._id}
                  className="muted"
                  style={{
                    fontSize: "0.85rem",
                    background: "none",
                    border: "none",
                    cursor: deletingId === run._id ? "wait" : "pointer",
                    padding: "0.25rem 0",
                    color: "var(--muted, #6b7280)",
                  }}
                >
                  {deletingId === run._id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
