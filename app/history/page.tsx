"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatDate, executiveSummarySnippet } from "@/lib/formatters";

export default function HistoryPage() {
  const digestRuns = useQuery(api.digestRuns.listRecent, { limit: 30 });
  const removeRun = useMutation(api.digestRuns.remove);
  const [deletingId, setDeletingId] = useState<Id<"digestRuns"> | null>(null);

  if (digestRuns === undefined) {
    return (
      <div className="stack">
        <h1>Digest log</h1>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Digest log</h1>
      <p className="muted" style={{ margin: 0 }}>
        Running log of AI-generated digests. A new digest is created only when source links change.
      </p>
      {digestRuns.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No digest runs yet. Run a scan from the <Link href="/dashboard">dashboard</Link> or <Link href="/targets">Watch Targets</Link>.
          </p>
        </div>
      ) : (
        <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {digestRuns.map((run) => (
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
                  <span className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.9rem" }}>
                    {run.period} · {run.totalSignals} signals
                    {run.criticalCount > 0 && ` · ${run.criticalCount} critical`}
                  </span>
                  <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.9rem", lineHeight: 1.4 }}>
                    {executiveSummarySnippet(run.executiveSummary)}
                  </p>
                  <span className="muted" style={{ marginTop: "0.5rem", display: "inline-block", fontSize: "0.85rem" }}>
                    View full digest →
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
